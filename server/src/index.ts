#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as process from "node:process";

// Запускаємо сервер
const server = new McpServer({
    name: "context-bonsai-mcp",
    version: "1.0.6"
});

const DEFAULT_STATE = {
    project_phase: "planning",
    active_objectives: [],
    completed_milestones: [],
    architecture_summary: "",
    known_issues: []
};

/**
 * Atomic write with backup:
 * 1. Writes to .tmp
 * 2. Copies current to .bak
 * 3. Renames .tmp to current
 */
async function safeWrite(filePath: string, content: string) {
    const tempPath = filePath + ".tmp";
    const bakPath = filePath + ".bak";
    
    await fs.writeFile(tempPath, content, "utf-8");
    
    try {
        await fs.access(filePath);
        await fs.copyFile(filePath, bakPath);
    } catch {}
    
    await fs.rename(tempPath, filePath);
}

// 1. Читання контексту
server.tool(
    "read_project_state",
    "Silent read of the project state.json which acts as the Context Bonsai unified source of truth",
    {},
    async () => {
        try {
            const statePath = path.join(process.cwd(), "state.json");
            const data = await fs.readFile(statePath, "utf-8");
            return {
                content: [{ type: "text", text: data }]
            };
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return {
                    content: [{ type: "text", text: "state.json does not exist yet. Please initialize it." }]
                };
            }
            throw error;
        }
    }
);

// 2. Оновлення графу проекту
server.tool(
    "update_project_state",
    "Update specific keys in the project state.json safely.",
    {
        project_phase: z.enum(["planning", "execution", "debugging", "verification"]).optional(),
        add_milestones: z.array(z.string()).optional(),
        architecture_summary: z.string().optional(),
        add_objective: z.string().describe("Add a new active task objective").optional(),
        remove_objective: z.string().describe("Remove a completed objective").optional(),
        add_issue: z.object({ id: z.string(), status: z.enum(["open", "resolved"]), context: z.string() }).describe("Log a new known issue").optional(),
        resolve_issue_id: z.string().describe("UUID of the issue to mark as resolved").optional()
    },
    async (args) => {
        const statePath = path.join(process.cwd(), "state.json");
        let state: any = { ...DEFAULT_STATE };
        try {
            const current = await fs.readFile(statePath, "utf-8");
            state = { ...state, ...JSON.parse(current) };
        } catch (e: any) {
            if (e.code !== 'ENOENT') {
                return {
                    isError: true,
                    content: [{ type: "text", text: `CRITICAL: state.json exists but contains invalid JSON. Please fix its syntax manually before invoking updates to prevent data loss. Error: ${e.message}` }]
                };
            }
            // Якщо файлу ще немає (ENOENT), це нормально, беремо DEFAULT_STATE
        }

        if (args.project_phase) state.project_phase = args.project_phase;
        if (args.architecture_summary) state.architecture_summary = args.architecture_summary;
        if (args.add_milestones && args.add_milestones.length > 0) {
            state.completed_milestones = [...new Set([...(state.completed_milestones || []), ...args.add_milestones])];
        }

        state.active_objectives = state.active_objectives || [];
        if (args.add_objective && !state.active_objectives.includes(args.add_objective)) {
            state.active_objectives.push(args.add_objective);
        }
        if (args.remove_objective) {
            state.active_objectives = state.active_objectives.filter((o: string) => o !== args.remove_objective);
        }

        state.known_issues = state.known_issues || [];
        if (args.add_issue) {
            state.known_issues.push(args.add_issue);
        }
        if (args.resolve_issue_id) {
            state.known_issues = state.known_issues.map((i: any) => 
                i.id === args.resolve_issue_id ? { ...i, status: "resolved" } : i
            );
        }

        await safeWrite(statePath, JSON.stringify(state, null, 2));
        return {
            content: [{ type: "text", text: `Success: state.json meticulously updated.` }]
        };
    }
);

// 3. Контекстний бонсай (Обрізання дерева)
server.tool(
    "prune_context_branch",
    "Append a dense, declarative summary of a fixed issue to bonsai_logs.md to relieve the active context window.",
    {
        issue_root_cause: z.string().describe("What exactly was the problem/bug"),
        final_solution: z.string().describe("How it was successfully fixed"),
        mutated_files: z.array(z.string()).describe("Paths of the files that were touched"),
        topic: z.string().describe("The semantic domain/module of this branch (e.g. 'Auth', 'UI', 'Database')")
    },
    async (args) => {
        const logPath = path.join(process.cwd(), "bonsai_logs.md");
        const topic = args.topic || "General";
        const entryBody = `**Date:** ${new Date().toISOString()}\n**Root Cause:** ${args.issue_root_cause}\n**Solution:** ${args.final_solution}\n**Mutated Files:**\n${args.mutated_files.map((f: string) => `- ${f}`).join("\n")}\n---\n`;

        let existingLogs = "";
        try {
            existingLogs = await fs.readFile(logPath, "utf-8");
        } catch (e) {}

        const blocks = existingLogs.split(/^## Topic: /m).filter(b => b.trim().length > 0);
        
        const topicMap: Record<string, string[]> = {};
        for (const block of blocks) {
            const lines = block.split('\n');
            const blockTopic = lines[0].trim();
            const contentEntries = block.substring(lines[0].length).split(/^### 🌳 PRUNED BRANCH/m).filter(c => c.trim().length > 0);
            topicMap[blockTopic] = contentEntries;
        }

        if (!topicMap[topic]) topicMap[topic] = [];
        topicMap[topic].push(entryBody);

        const MAX_PER_TOPIC = 3;
        let finalMarkdown = "# 🌳 Semantic Context Logs\n\n";
        
        for (const [t, entries] of Object.entries(topicMap)) {
            const prunedEntries = entries.length > MAX_PER_TOPIC ? entries.slice(-MAX_PER_TOPIC) : entries;
            finalMarkdown += `## Topic: ${t}\n`;
            for (const entry of prunedEntries) {
                finalMarkdown += `### 🌳 PRUNED BRANCH\n${entry.trim()}\n\n`;
            }
        }

        await safeWrite(logPath, finalMarkdown);
        
        return {
            content: [{ type: "text", text: `Success: Semantic pruning complete. Log added to topic [${topic}]. Retained top ${MAX_PER_TOPIC} logs per semantic topic.` }]
        };
    }
);

// Транспорт
async function run() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Context Bonsai MCP Server running on stdio");
}

run().catch(console.error);
