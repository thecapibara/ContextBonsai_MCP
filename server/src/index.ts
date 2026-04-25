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
    version: "1.0.0"
});

const DEFAULT_STATE = {
    project_phase: "planning",
    active_objectives: [],
    completed_milestones: [],
    architecture_summary: "",
    known_issues: []
};

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

        await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf-8");
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
        mutated_files: z.array(z.string()).describe("Paths of the files that were touched")
    },
    async (args) => {
        const logPath = path.join(process.cwd(), "bonsai_logs.md");
        const logEntry = `## 🌳 PRUNED BRANCH: ${new Date().toISOString()}\n**Root Cause:** ${args.issue_root_cause}\n**Solution:** ${args.final_solution}\n**Mutated Files:**\n${args.mutated_files.map(f => `- ${f}`).join("\n")}\n---\n`;

        let existingLogs = "";
        try {
            existingLogs = await fs.readFile(logPath, "utf-8");
        } catch (e) {}

        const separator = "## 🌳 PRUNED BRANCH:";
        let entries = existingLogs
            .split(separator)
            .filter(e => e.trim().length > 0)
            .map(e => separator + e);
        
        entries.push(logEntry);

        const MAX_ENTRIES = 5;
        if (entries.length > MAX_ENTRIES) {
            entries = entries.slice(-MAX_ENTRIES);
        }

        await fs.writeFile(logPath, entries.join("\n"), "utf-8");
        
        return {
            content: [{ type: "text", text: `Success: Dead branches pruned. Keeping strictly the latest ${MAX_ENTRIES} logs in bonsai_logs.md to preserve context tokens.` }]
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
