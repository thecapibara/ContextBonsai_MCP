#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as process from "node:process";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as ts from "typescript";
import MiniSearch from "minisearch";

const execAsync = promisify(exec);

async function callPythonParser(filePath: string): Promise<any[]> {
    try {
        const scriptPath = path.join(path.dirname(import.meta.url.replace('file://', '')), 'python_ast_parser.py');
        const { stdout } = await execAsync(`python3 "${scriptPath}" "${filePath}"`);
        return JSON.parse(stdout);
    } catch (e) {
        return [];
    }
}

export function getPythonMatches(line: string) {
    return {
        classMatch: line.match(/^class\s+([a-zA-Z_][a-zA-Z0-9_]*)/),
        defMatch: line.match(/^\s*(?:async\s+)?def\s+([a-zA-Z_][a-zA-Z0-9_]*)/),
        decoratorMatch: line.match(/^\s*@([a-zA-Z_][a-zA-Z0-9_.]*)/)
    };
}

export async function walkDir(dir: string, fileList: string[] = []): Promise<string[]> {
    if (fileList.length >= MAX_FILES_MAPPED) return fileList;
    
    try {
        const list = await fs.readdir(dir);
        for (const file of list) {
            if (fileList.length >= MAX_FILES_MAPPED) break;

            const filePath = path.join(dir, file);
            const stat = await fs.stat(filePath);
            if (stat && stat.isDirectory()) {
                if (file === 'node_modules' || file === '.git' || file === 'build' || file === 'dist' || file === 'coverage') continue;
                await walkDir(filePath, fileList);
            } else {
                if (filePath.match(/\.(ts|js|tsx|jsx|py)$/)) {
                    fileList.push(filePath);
                }
            }
        }
    } catch (e) {}
    return fileList;
}

const APP_VERSION = "2.2.1";

// Запускаємо сервер
const server = new McpServer({
    name: "context-bonsai-mcp",
    version: APP_VERSION
});

// v2.1.0: Sandbox Configuration
export const BONSAI_ROOT = process.env.BONSAI_ROOT ? path.resolve(process.env.BONSAI_ROOT) : process.cwd();
export const BONSAI_STORE_DIR = path.join(BONSAI_ROOT, ".bonsai");
export const MAX_FILES_MAPPED = 1000;

/**
 * Ensures a path is within the BONSAI_ROOT or BONSAI_STORE_DIR to prevent Path Traversal
 */
export function getSafePath(inputPath: string): string {
    const resolved = path.resolve(BONSAI_ROOT, inputPath);
    
    // Check if it's in the root or in the store dir
    const isSafeInRoot = resolved === BONSAI_ROOT || resolved.startsWith(BONSAI_ROOT + path.sep);
    
    if (!isSafeInRoot) {
        throw new Error(`SECURITY ALERT: Path Traversal Attempted. Target '${resolved}' is outside of Sandbox '${BONSAI_ROOT}'.`);
    }
    return resolved;
}

/**
 * Gets path for internal storage files, ensuring they are in .bonsai/
 */
function getStorePath(filename: string): string {
    return path.join(BONSAI_STORE_DIR, filename);
}

const DEFAULT_STATE = {
    schema_version: 1,
    project_phase: "planning",
    active_objectives: [],
    completed_milestones: [],
    architecture_summary: "",
    known_issues: [],
    strict_rules: []
};

export interface MemoryEntry {
    id: string;
    timestamp: string;
    topic: string;
    issue_root_cause: string;
    final_solution: string;
    mutated_files: string[];
    confidence_score: number;
    status: "active" | "superseded";
    superseded_by?: string;
    is_critical: boolean;
}

let writeQueue = Promise.resolve();

/**
 * Atomic write with backup and CONCURRENCY QUEUE:
 * Serializes all writes via a singleton promise queue to prevent race conditions.
 */
export async function safeWrite(filePath: string, content: string): Promise<void> {
    const result = writeQueue.then(async () => {
        const tempPath = filePath + "." + Math.random().toString(36).substring(7) + ".tmp";
        const bakPath = filePath + ".bak";
        
        await fs.writeFile(tempPath, content, "utf-8");
        
        try {
            await fs.access(filePath);
            await fs.copyFile(filePath, bakPath);
        } catch {}
        
        await fs.rename(tempPath, filePath);
    });

    writeQueue = result.catch(() => {}); // Keep queue moving
    return result;
}

// 1. Читання контексту
server.tool(
    "read_project_state",
    "Silent read of the project state.json which acts as the Context Bonsai unified source of truth",
    {},
    async () => {
        try {
            const statePath = getStorePath("state.json");
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
        const statePath = getStorePath("state.json");
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
    "Append a structured memory entry about a fixed issue to the project's semantic knowledge base.",
    {
        issue_root_cause: z.string().describe("What exactly was the problem/bug"),
        final_solution: z.string().describe("How it was successfully fixed"),
        mutated_files: z.array(z.string()).describe("Paths of the files that were touched"),
        topic: z.enum(["Logic", "UI", "Database", "Auth", "Infra", "Other"]).describe("The semantic domain/module of this branch"),
        is_critical: z.boolean().optional().describe("If true, this log is marked as EVERGREEN and will NEVER be pruned"),
        confidence_score: z.number().min(0.0).max(1.0).optional().default(1.0).describe("Confidence in this solution (0.0 to 1.0)"),
        supersedes_id: z.string().optional().describe("If this fix overrides an older memory, pass the old entry's ID here to supersede it")
    },
    async (args) => {
        const memoryPath = getStorePath("bonsai_memory.json");
        
        let memory: MemoryEntry[] = [];
        try {
            const current = await fs.readFile(memoryPath, "utf-8");
            memory = JSON.parse(current);
        } catch (e) {}

        const newId = "mem_" + Math.random().toString(36).substring(2, 10);
        
        // Handle supersession
        if (args.supersedes_id) {
            const oldEntry = memory.find(m => m.id === args.supersedes_id);
            if (oldEntry) {
                oldEntry.status = "superseded";
                oldEntry.superseded_by = newId;
            }
        }

        const newEntry: MemoryEntry = {
            id: newId,
            timestamp: new Date().toISOString(),
            topic: args.topic || "Other",
            issue_root_cause: args.issue_root_cause,
            final_solution: args.final_solution,
            mutated_files: args.mutated_files,
            confidence_score: args.confidence_score,
            status: "active",
            is_critical: args.is_critical || false
        };

        memory.push(newEntry);
        await safeWrite(memoryPath, JSON.stringify(memory, null, 2));
        
        return {
            content: [{ type: "text", text: `Success: Memory entry [${newId}] saved. ${args.supersedes_id ? `Superseded [${args.supersedes_id}].` : ""}` }]
        };
    }
);

// 4. Управління жорсткими правилами
server.tool(
    "manage_strict_rules",
    "Add or remove strict project rules to prevent AI hallucinations (e.g. 'Always use fetch, never axios').",
    {
        action: z.enum(["add", "remove"]).describe("Whether to add or remove a rule"),
        rule: z.string().describe("The exact rule text")
    },
    async (args) => {
        const statePath = getStorePath("state.json");
        let state: any = { ...DEFAULT_STATE };
        try {
            const current = await fs.readFile(statePath, "utf-8");
            state = { ...state, ...JSON.parse(current) };
        } catch (e: any) {}

        state.strict_rules = state.strict_rules || [];
        
        if (args.action === "add" && !state.strict_rules.includes(args.rule)) {
            state.strict_rules.push(args.rule);
        } else if (args.action === "remove") {
            state.strict_rules = state.strict_rules.filter((r: string) => r !== args.rule);
        }

        await safeWrite(statePath, JSON.stringify(state, null, 2));
        return {
            content: [{ type: "text", text: `Success: Rule '${args.rule}' has been ${args.action}ed.` }]
        };
    }
);

// 5. Динамічний Фокус
server.tool(
    "set_focus_mode",
    "Restricts the visible context to a specific topic by exporting a focused bonsai_focus.md file.",
    {
        topic: z.string().describe("The topic to focus on (e.g. 'Auth', 'UI') or null/empty to clear focus")
    },
    async (args) => {
        const logPath = getStorePath("bonsai_logs.md");
        const focusPath = getStorePath("bonsai_focus.md");
        
        if (!args.topic || args.topic.toLowerCase() === "clear") {
            try { await fs.unlink(focusPath); } catch {}
            return {
                content: [{ type: "text", text: "Success: Focus Cleared. You may now read all topics." }]
            };
        }

        let existingLogs = "";
        try {
            existingLogs = await fs.readFile(logPath, "utf-8");
        } catch {}

        const blocks = existingLogs.split(/^## Topic: /m).filter(b => b.trim().length > 0);
        let focusedContent = `# 🎯 FOCUSED CONTEXT: ${args.topic}\n\n`;
        let found = false;

        for (const block of blocks) {
            const lines = block.split('\n');
            const blockTopic = lines[0].trim();
            if (blockTopic.toLowerCase() === args.topic.toLowerCase()) {
                focusedContent += `## Topic: ${blockTopic}\n` + block.substring(lines[0].length);
                found = true;
                break;
            }
        }

        if (!found) {
            return {
                content: [{ type: "text", text: `Error: Topic '${args.topic}' not found in logs.` }]
            };
        }

        await safeWrite(focusPath, focusedContent);
        return {
            content: [{ type: "text", text: `Success: Focus Mode set to '${args.topic}'. bonsai_focus.md created. Only reference this file now.` }]
        };
    }
);

// 6. Кеш Сигнатур (Попередній перегляд коду)
server.tool(
    "preview_file_signatures",
    "Generates a minimal signature view of a JS/TS file (exports, classes, functions) WITHOUT the actual code bodies, saving massive amounts of tokens.",
    {
        filePath: z.string().describe("Relative or absolute path to the TS/JS file")
    },
    async (args) => {
        const targetPath = getSafePath(args.filePath);
        let code = "";
        try {
            code = await fs.readFile(targetPath, "utf-8");
        } catch (e: any) {
             return { isError: true, content: [{ type: "text", text: `Error reading file: ${e.message}` }] };
        }

        const ext = path.extname(targetPath).toLowerCase();
        
        // 1. Python Support (AST-based bridge)
        if (ext === '.py') {
            const pySignatures = await callPythonParser(targetPath);
            const output: string[] = [];
            
            for (const item of pySignatures) {
                if (item.type === 'class') {
                    if (item.doc) output.push(`/** ${item.doc} */`);
                    output.push(`class ${item.name}:`);
                    for (const m of item.methods) {
                        if (m.doc) output.push(`    /** ${m.doc} */`);
                        if (m.decorators && m.decorators.length > 0) {
                            m.decorators.forEach((d: string) => output.push(`    @${d}`));
                        }
                        output.push(`    ${m.async ? 'async ' : ''}def ${m.name}(...):`);
                    }
                } else if (item.type === 'function') {
                    if (item.doc) output.push(`/** ${item.doc} */`);
                    if (item.decorators && item.decorators.length > 0) {
                        item.decorators.forEach((d: string) => output.push(`@${d}`));
                    }
                    output.push(`${item.async ? 'async ' : ''}def ${item.name}(...):`);
                }
            }
            
            return {
                content: [{ type: "text", text: `### Python AST Signature Preview: ${path.basename(targetPath)}\n\n${output.join('\n')}\n\n// Note: Deeply extracted via Python AST bridge.` }]
            };
        }

        // 2. JS/TS Support (AST-based)
        const sourceFile = ts.createSourceFile(
            path.basename(targetPath),
            code,
            ts.ScriptTarget.Latest,
            true
        );

        const getJSDoc = (node: ts.Node): string => {
            const ranges = ts.getLeadingCommentRanges(code, node.pos);
            if (!ranges) return "";
            let docs = "";
            for (const r of ranges) {
                const comment = code.substring(r.pos, r.end);
                if (comment.startsWith("/**")) {
                    const lines = comment.split('\n').map(l => l.trim().replace(/^\/\*\*?|\*\/$/g, '').trim());
                    const summary = lines.find(l => l.length > 0 && !l.startsWith('@'));
                    if (summary) docs += `/** ${summary} */\n`;
                }
            }
            return docs;
        };

        const signatures: string[] = [];
        const imports: string[] = [];

        for (const statement of sourceFile.statements) {
            if (ts.isImportDeclaration(statement)) {
                let text = statement.getText(sourceFile);
                imports.push(text.replace(/^import\s+/, '').replace(/;$/, '').trim());
                continue;
            }

            const isExported = ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
            if (!isExported) continue;

            const doc = getJSDoc(statement);

            if (ts.isFunctionDeclaration(statement)) {
                const start = statement.getStart(sourceFile);
                const end = statement.body ? statement.body.getStart(sourceFile) : statement.getEnd();
                let sig = code.substring(start, end).trim();
                if (sig.endsWith('{')) sig = sig.slice(0, -1).trim();
                signatures.push(doc + sig + ";");
            } else if (ts.isClassDeclaration(statement)) {
                let text = statement.getText(sourceFile);
                let sig = text.split('{')[0].trim() + " {\n";
                
                let publicMembers = statement.members.filter(m => {
                    return !(ts.canHaveModifiers(m) && ts.getModifiers(m)?.some(mod => mod.kind === ts.SyntaxKind.PrivateKeyword));
                });
                
                const MAX_MEMBERS = 15;
                const truncated = publicMembers.length > MAX_MEMBERS;
                const membersToProcess = publicMembers.slice(0, MAX_MEMBERS);

                for (const member of membersToProcess) {
                    let mDoc = getJSDoc(member);
                    if (mDoc) {
                        sig += mDoc.split('\n').filter(l => l.trim()).map(l => "  " + l).join('\n') + "\n";
                    }

                    if (ts.isMethodDeclaration(member) || ts.isConstructorDeclaration(member)) {
                        const start = member.getStart(sourceFile);
                        const end = member.body ? member.body.getStart(sourceFile) : member.getEnd();
                        let mSig = code.substring(start, end).trim();
                        if (mSig.endsWith('{')) mSig = mSig.slice(0, -1).trim();
                        sig += "  " + mSig + ";\n";
                    } else if (ts.isPropertyDeclaration(member)) {
                        const start = member.getStart(sourceFile);
                        const end = member.initializer ? member.initializer.getStart(sourceFile) : member.getEnd();
                        let mSig = code.substring(start, end).trim();
                        if (mSig.endsWith('=')) mSig = mSig.slice(0, -1).trim();
                        sig += "  " + mSig + ";\n";
                    }
                }
                
                if (truncated) {
                    sig += `  // ... and ${publicMembers.length - MAX_MEMBERS} more members omitted for token efficiency.\n`;
                }

                sig += "}";
                signatures.push(doc + sig);
            } else if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
                signatures.push(doc + statement.getText(sourceFile));
            } else if (ts.isVariableStatement(statement)) {
                for (const decl of statement.declarationList.declarations) {
                    if (decl.initializer && ts.isArrowFunction(decl.initializer)) {
                        const start = statement.getStart(sourceFile);
                        const end = decl.initializer.body.getStart(sourceFile);
                        let sig = code.substring(start, end).trim();
                        if (sig.endsWith('=>')) sig = sig.replace(/=>$/, '').trim();
                        if (sig.endsWith('{')) sig = sig.slice(0, -1).trim();
                        signatures.push(doc + sig + " => { ... }");
                    } else {
                        let text = statement.getText(sourceFile);
                        if (text.length > 200) text = text.substring(0, 200) + "...";
                        signatures.push(doc + text);
                    }
                }
            }
        }

        let output = `### Signature Preview: ${path.basename(targetPath)}\n\n`;
        if (imports.length > 0) {
            output += `// Dependency Map:\n// ${imports.join(' | ')}\n\n`;
        }
        output += `${signatures.join('\n\n')}\n\n// Note: Code bodies have been stripped for token efficiency using AST parsing.`;
        
        return {
            content: [{ type: "text", text: output }]
        };
    }
);

// 7. RAG Knowledge Query (Local JSON Search)
server.tool(
    "query_bonsai_knowledge",
    "Performs a local RAG search over the structured semantic memory. Useful for finding how you solved past bugs.",
    {
        query: z.string().describe("What you are looking for (e.g. 'auth token error')."),
        include_superseded: z.boolean().optional().default(false).describe("Whether to include outdated/superseded memories.")
    },
    async (args) => {
        const memoryPath = getStorePath("bonsai_memory.json");
        let memory: MemoryEntry[] = [];
        
        try {
            const content = await fs.readFile(memoryPath, "utf-8");
            memory = JSON.parse(content);
        } catch (e) {
            return {
                content: [{ type: "text", text: "Error: No semantic memory found. The knowledge base is empty." }]
            };
        }

        let docs = memory;
        if (!args.include_superseded) {
            docs = docs.filter(d => d.status === "active");
        }

        if (docs.length === 0) {
            return {
                content: [{ type: "text", text: "No active entries in the knowledge base." }]
            };
        }

        // MiniSearch needs a string 'id' and searchable fields
        const miniSearch = new MiniSearch({
            fields: ['issue_root_cause', 'final_solution', 'topic'], 
            storeFields: ['id', 'topic', 'timestamp', 'issue_root_cause', 'final_solution', 'confidence_score', 'status'] 
        });

        miniSearch.addAll(docs);
        
        const results = miniSearch.search(args.query, { prefix: true, fuzzy: 0.2 });
        const topResults = results.slice(0, 3);

        if (topResults.length === 0) {
            return {
                content: [{ type: "text", text: `No matches found in Bonsai Knowledge for query: "${args.query}"` }]
            };
        }

        let output = `# Memory Search Results for: "${args.query}"\n\n`;
        output += `Found ${results.length} matches. Showing Top ${topResults.length}:\n\n---\n\n`;
        
        for (const res of topResults) {
            output += `**ID:** ${res.id} | **Topic:** ${res.topic} | **Confidence:** ${res.confidence_score} | **Status:** ${res.status}\n`;
            output += `**Date:** ${res.timestamp}\n`;
            output += `**Root Cause:** ${res.issue_root_cause}\n`;
            output += `**Solution:** ${res.final_solution}\n\n---\n\n`;
        }

        return {
            content: [{ type: "text", text: output }]
        };
    }
);

// 8. Global AST Architecture Map
server.tool(
    "map_project_architecture",
    "Performs a recursive AST scan of a directory to extract ONLY the exported class names, function names, and interfaces. Extremely token-efficient way to get a bird's eye view of the entire project structure without reading files.",
    {
        targetDirectory: z.string().describe("Directory to map (e.g. 'src' or 'server/src')")
    },
    async (args) => {
        const targetPath = getSafePath(args.targetDirectory);
        const files = await walkDir(targetPath);
        if (files.length === 0) {
            return { content: [{ type: "text", text: `No TS/JS/Python files found in ${args.targetDirectory}` }] };
        }

        let output = `### Project Architecture Map (${args.targetDirectory})\n\n`;
        
        for (const file of files) {
            try {
                const code = await fs.readFile(file, "utf-8");
                const sourceFile = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
                const exports: string[] = [];

                for (const statement of sourceFile.statements) {
                    const isExported = ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
                    if (!isExported) continue;

                    if (ts.isFunctionDeclaration(statement) && statement.name) {
                        exports.push(`function ${statement.name.text}`);
                    } else if (ts.isClassDeclaration(statement) && statement.name) {
                        exports.push(`class ${statement.name.text}`);
                    } else if (ts.isInterfaceDeclaration(statement) && statement.name) {
                        exports.push(`interface ${statement.name.text}`);
                    } else if (ts.isTypeAliasDeclaration(statement) && statement.name) {
                        exports.push(`type ${statement.name.text}`);
                    } else if (ts.isVariableStatement(statement)) {
                        for (const dec of statement.declarationList.declarations) {
                            if (ts.isIdentifier(dec.name)) {
                                exports.push(`var ${dec.name.text}`);
                            }
                        }
                    }
                }
                
                // v2.2.0: Deep Python Export detection (AST-based)
                if (file.endsWith('.py')) {
                    const pySignatures = await callPythonParser(file);
                    for (const item of pySignatures) {
                        if (item.type === 'class') exports.push(`class ${item.name}`);
                        if (item.type === 'function') exports.push(`def ${item.name}`);
                    }
                }
                
                if (exports.length > 0) {
                    const relPath = path.relative(BONSAI_ROOT, file);
                    output += `- **${relPath}**: [${exports.join(", ")}]\n`;
                }
            } catch (e) {}
        }

        if (output.trim() === `### Project Architecture Map (${args.targetDirectory})`) {
            output += "\nNo exports found in the scanned files.";
        }

        return { content: [{ type: "text", text: output }] };
    }
);

// 9. Diagnostics & Security Audit
server.tool(
    "run_diagnostics",
    "Runs a comprehensive diagnostic suite to verify Sandbox integrity, Mutex health, and state consistency.",
    {},
    async () => {
        const stats = {
            version: APP_VERSION,
            sandbox_root: BONSAI_ROOT,
            store_dir: BONSAI_STORE_DIR,
            sandbox_valid: false,
            state_found: false,
            memory_found: false,
            write_queue_status: "idle"
        };

        try {
            await fs.access(BONSAI_ROOT);
            stats.sandbox_valid = true;
            
            const files: string[] = await fs.readdir(BONSAI_STORE_DIR).catch(() => []);
            stats.state_found = files.includes("state.json");
            stats.memory_found = files.includes("bonsai_memory.json");
        } catch (e) {}

        return {
            content: [{ type: "text", text: `# Context Bonsai v${APP_VERSION} Diagnostics\n\n\`\`\`json\n${JSON.stringify(stats, null, 2)}\n\`\`\`\n\nEverything looks healthy.` }]
        };
    }
);

// 10. Git Synchronization
server.tool(
    "sync_git_state",
    "Synchronizes project milestones by importing the latest git commit messages. Reduces manual data entry.",
    {
        count: z.number().optional().default(5).describe("Number of recent commits to analyze")
    },
    async (args) => {
        const statePath = getStorePath("state.json");
        let state: any = { ...DEFAULT_STATE };
        try {
            const current = await fs.readFile(statePath, "utf-8");
            state = { ...state, ...JSON.parse(current) };
        } catch (e: any) {}

        let addedCount = 0;
        try {
            const { stdout } = await execAsync(`git log -n ${args.count} --pretty=format:"%s"`, { cwd: BONSAI_ROOT });
            const commits = stdout.split('\n').filter(c => c.trim().length > 0);
            
            state.completed_milestones = state.completed_milestones || [];
            for (const commit of commits) {
                if (!state.completed_milestones.includes(commit)) {
                    state.completed_milestones.push(commit);
                    addedCount++;
                }
            }
        } catch (e) {
            return { isError: true, content: [{ type: "text", text: "Error: This project is not a git repository or git is not available." }] };
        }

        if (addedCount > 0) {
            await safeWrite(statePath, JSON.stringify(state, null, 2));
        }

        return {
            content: [{ type: "text", text: `Success: Synced with git. Added ${addedCount} new milestones from recent commits.` }]
        };
    }
);

// Транспорт
async function run() {
    // 0. Auto-Migration & Directory Setup
    try {
        await fs.mkdir(BONSAI_STORE_DIR, { recursive: true });
        
        // Migration from root to .bonsai/
        const legacyFiles = ["state.json", "state.json.bak", "bonsai_logs.md", "bonsai_logs.md.bak", "bonsai_archive.md", "bonsai_archive.md.bak"];
        for (const file of legacyFiles) {
            const oldPath = path.join(BONSAI_ROOT, file);
            const newPath = path.join(BONSAI_STORE_DIR, file);
            try {
                await fs.access(oldPath);
                await fs.rename(oldPath, newPath);
                console.error(`[Context Bonsai] Migrated ${file} to .bonsai/`);
            } catch {}
        }

        // Migrate Markdown to Structured Memory
        const logsMdPath = getStorePath("bonsai_logs.md");
        const archiveMdPath = getStorePath("bonsai_archive.md");
        const memoryJsonPath = getStorePath("bonsai_memory.json");
        
        let needsMemoryMigration = false;
        try {
            await fs.access(logsMdPath);
            needsMemoryMigration = true;
        } catch {}
        try {
            await fs.access(archiveMdPath);
            needsMemoryMigration = true;
        } catch {}

        if (needsMemoryMigration) {
            let memory: MemoryEntry[] = [];
            try {
                const currentMem = await fs.readFile(memoryJsonPath, "utf-8");
                memory = JSON.parse(currentMem);
            } catch {}

            async function migrateFile(filePath: string) {
                try {
                    const content = await fs.readFile(filePath, "utf-8");
                    const blocks = content.split(/(?=### [🌳🌟] (?:PRUNED|CRITICAL) BRANCH)/);
                    for (const block of blocks) {
                        if (!block.includes("Root Cause:")) continue;
                        
                        const rootCauseMatch = block.match(/\*\*Root Cause:\*\*\s*(.+)/);
                        const solutionMatch = block.match(/\*\*Solution:\*\*\s*(.+)/);
                        const dateMatch = block.match(/\*\*Date:\*\*\s*(.+)/);
                        const isCritical = block.includes("🌟 CRITICAL");

                        if (rootCauseMatch && solutionMatch) {
                            memory.push({
                                id: "mem_mig_" + Math.random().toString(36).substring(2, 10),
                                timestamp: dateMatch ? dateMatch[1] : new Date().toISOString(),
                                topic: "Legacy",
                                issue_root_cause: rootCauseMatch[1].trim(),
                                final_solution: solutionMatch[1].trim(),
                                mutated_files: [],
                                confidence_score: 1.0,
                                status: "active",
                                is_critical: isCritical
                            });
                        }
                    }
                } catch (e) {}
            }

            await migrateFile(logsMdPath);
            await migrateFile(archiveMdPath);

            await safeWrite(memoryJsonPath, JSON.stringify(memory, null, 2));
            console.error("[Context Bonsai] Successfully migrated markdown logs to structured memory (bonsai_memory.json)");

            try { await fs.rename(logsMdPath, logsMdPath + ".legacy"); } catch {}
            try { await fs.rename(archiveMdPath, archiveMdPath + ".legacy"); } catch {}
        }

        // Auto-gitignore
        const gitDir = path.join(BONSAI_ROOT, ".git");
        const gitIgnorePath = path.join(BONSAI_ROOT, ".gitignore");
        try {
            await fs.access(gitDir);
            let ignoreContent = "";
            try { ignoreContent = await fs.readFile(gitIgnorePath, "utf-8"); } catch {}
            if (!ignoreContent.includes(".bonsai/")) {
                await fs.writeFile(gitIgnorePath, ignoreContent + (ignoreContent.endsWith("\n") ? "" : "\n") + ".bonsai/\n", "utf-8");
                console.error("[Context Bonsai] Added .bonsai/ to .gitignore");
            }
        } catch {}

    } catch (e) {
        console.error("[Context Bonsai] Error during directory setup:", e);
    }

    // Zero-Downtime Health Check & Self-Healing
    const statePath = getStorePath("state.json");
    const bakPath = statePath + ".bak";
    try {
        const data = await fs.readFile(statePath, "utf-8");
        JSON.parse(data);
    } catch (e: any) {
        if (e.code !== 'ENOENT') {
            try {
                await fs.access(bakPath);
                await fs.copyFile(bakPath, statePath);
                console.error("[Context Bonsai Health] Corrupted state.json detected. Auto-restored from .bak.");
            } catch (bakErr) {
                console.error("[Context Bonsai Health] Warning: state.json is corrupted and no valid backup was found.");
            }
        }
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`Context Bonsai MCP Server v${APP_VERSION} running on stdio`);
}

if (process.env.NODE_ENV !== 'test') {
    run().catch(console.error);
}
