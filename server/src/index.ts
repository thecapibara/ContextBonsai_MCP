#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as process from "node:process";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

// Запускаємо сервер
const server = new McpServer({
    name: "context-bonsai-mcp",
    version: "1.2.0"
});

const DEFAULT_STATE = {
    schema_version: 1,
    project_phase: "planning",
    active_objectives: [],
    completed_milestones: [],
    architecture_summary: "",
    known_issues: []
};

let writeQueue = Promise.resolve();

/**
 * Atomic write with backup and CONCURRENCY QUEUE:
 * 1. Serializes all writes via a singleton promise queue.
 * 2. Uses unique temp files to prevent collision on rapid concurrent calls.
 * 3. Maintains .bak for disaster recovery.
 */
async function safeWrite(filePath: string, content: string) {
    const operation = (async () => {
        const tempPath = filePath + "." + Math.random().toString(36).substring(7) + ".tmp";
        const bakPath = filePath + ".bak";
        
        await fs.writeFile(tempPath, content, "utf-8");
        
        try {
            await fs.access(filePath);
            await fs.copyFile(filePath, bakPath);
        } catch {}
        
        await fs.rename(tempPath, filePath);
    })();

    writeQueue = writeQueue.then(() => operation).catch(() => operation);
    return operation;
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
        topic: z.enum(["Logic", "UI", "Database", "Auth", "Infra", "Other"]).describe("The semantic domain/module of this branch"),
        is_critical: z.boolean().optional().describe("If true, this log is marked as EVERGREEN and will NEVER be pruned")
    },
    async (args) => {
        const logPath = path.join(process.cwd(), "bonsai_logs.md");
        const archivePath = path.join(process.cwd(), "bonsai_archive.md");
        const topic = args.topic || "General";
        const marker = args.is_critical ? "### 🌟 CRITICAL BRANCH" : "### 🌳 PRUNED BRANCH";
        
        let gitContext = "";
        try {
            const { stdout: hash } = await execAsync("git rev-parse --short HEAD", { cwd: process.cwd() });
            const { stdout: branch } = await execAsync("git rev-parse --abbrev-ref HEAD", { cwd: process.cwd() });
            gitContext = `**Git:** \`${branch.trim()}@${hash.trim()}\`\n`;
        } catch (e) {
            // Ignore non-git repos
        }

        const entryBody = `**Date:** ${new Date().toISOString()}\n${gitContext}**Root Cause:** ${args.issue_root_cause}\n**Solution:** ${args.final_solution}\n**Mutated Files:**\n${args.mutated_files.map((f: string) => `- ${f}`).join("\n")}\n---\n`;

        let existingLogs = "";
        try {
            existingLogs = await fs.readFile(logPath, "utf-8");
        } catch (e) {}

        const blocks = existingLogs.split(/^## Topic: /m).filter(b => b.trim().length > 0);
        
        const topicMap: Record<string, string[]> = {};
        for (const block of blocks) {
            const lines = block.split('\n');
            const blockTopic = lines[0].trim();
            const contentEntries = block.substring(lines[0].length)
                .split(/^(?=### [🌳🌟] (?:PRUNED|CRITICAL) BRANCH)/m)
                .filter(c => c.trim().length > 0);
            topicMap[blockTopic] = contentEntries;
        }

        if (!topicMap[topic]) topicMap[topic] = [];
        topicMap[topic].push(`${marker}\n${entryBody}`);

        const MAX_PRUNED_PER_TOPIC = 3;
        const MAX_EVERGREEN_PER_TOPIC = 5;
        let finalMarkdown = "# 🌳 Semantic Context Logs\n\n";
        let archivedContent = "";
        
        for (const [t, entries] of Object.entries(topicMap)) {
            finalMarkdown += `## Topic: ${t}\n`;
            
            const criticals = entries.filter(e => e.includes("🌟 CRITICAL BRANCH"));
            const pruned = entries.filter(e => e.includes("🌳 PRUNED BRANCH"));
            
            // Handle Evergreen Overflow (Deep Archive)
            let keptEvergreens = criticals;
            if (criticals.length > MAX_EVERGREEN_PER_TOPIC) {
                const toArchive = criticals.slice(0, criticals.length - MAX_EVERGREEN_PER_TOPIC);
                keptEvergreens = criticals.slice(-MAX_EVERGREEN_PER_TOPIC);
                archivedContent += `## 🏺 ARCHIVED TOPIC: ${t} (${new Date().toISOString()})\n${toArchive.join("\n\n")}\n---\n`;
            }

            const keptPruned = pruned.slice(-MAX_PRUNED_PER_TOPIC);
            
            for (const entry of keptEvergreens) {
                finalMarkdown += `${entry.trim()}\n\n`;
            }
            for (const entry of keptPruned) {
                finalMarkdown += `${entry.trim()}\n\n`;
            }
        }

        await safeWrite(logPath, finalMarkdown);
        
        if (archivedContent) {
            let existingArchive = "";
            try {
                existingArchive = await fs.readFile(archivePath, "utf-8");
            } catch {}
            await safeWrite(archivePath, (existingArchive || "# 🏺 Context Bonsai Deep Archive\n\n") + archivedContent);
        }
        
        return {
            content: [{ type: "text", text: `Success: Semantic pruning complete. ${args.is_critical ? "Critical Log added." : "Standard Log added."} ${archivedContent ? "Old critical logs moved to Deep Archive." : ""}` }]
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
