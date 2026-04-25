# 🌳 Context Bonsai (MCP Server)

[![NPM Version](https://img.shields.io/npm/v/context-bonsai-mcp.svg)](https://www.npmjs.com/package/context-bonsai-mcp)

Welcome to **Context Bonsai**, an advanced state-machine and context compression tool for Claude Code and Claude Desktop. 
This tool reduces context window exhaustion and hallucinations by enforcing strict conversational "pruning" and isolated project state management.

## 🛠 1. Requirements

To use this server, you must have **Node.js** and **npm** installed on your system.
- Download and install Node.js from the [official website](https://nodejs.org/). (Installation will automatically include `npm`).
- Verify your installation by opening a terminal and running:
  ```bash
  node -v
  npm -v
  ```

## 🚀 2. Installation & Setup

This server is officially published to the global NPM registry! You can view the package page here: [npmjs.com/package/context-bonsai-mcp](https://www.npmjs.com/package/context-bonsai-mcp).

You **do not** need to clone this repository manually to use the tools. Because the server is published globally, you can inject it into your environment simply by updating your Claude client's global settings (e.g., `~/.claude_code/config.json` for Claude Code or `claude_desktop_config.json` for Claude Desktop).

Add the following block:
```json
"mcpServers": {
  "context-bonsai": {
    "command": "npx",
    "args": ["-y", "context-bonsai-mcp"]
  }
}
```
*Note: Fully restart Claude after updating your configuration so it picks up the newly registered logic!*

## 🧠 3. The 4 Core Skills (Methodology)

Context Bonsai brings 4 distinct "Skills" to Claude conceptually (typically enforced via a `CLAUDE.md` project manifesto):

1. **Dynamic Project Graph (State-Machine)**: Replaces parsing 500 lines of chat history with a clean `state.json` file.
2. **Context Bonsai**: Automatically slices dead conversation branches after fixing a bug, leaving only the "Root Cause/Solution" hash in `bonsai_logs.md`.
3. **Semantic Archiver**: Synthesizes long conversations into dense architectural facts safely migrated to `architecture.md`.
4. **Fractal Context (Micro-Delegation)**: Enforces rules encouraging the agent to process granular tasks (like regex creation) silently in isolation rather than polluting the main context window with trial-and-error chatter.

## 🔌 4. The 6 Technical MCP Tools

While there are 4 logical skills, the MCP Server exposes **6 technical tools** to the LLM to achieve them securely under the hood:

1. **`read_project_state`** 
   - *What it does*: Silently fetches `state.json`, allowing Claude to remember the project phase effortlessly.
2. **`update_project_state` (CRUD Array Handler)** 
   - *What it does*: Provides native JSON mutation logic natively wrapped in Thread-Safe singleton Promise queues and atomic file swaps. 
3. **`prune_context_branch` (Semantic Archiver)**
   - *What it does*: Saves completed logic context in `bonsai_logs.md`. It implements a semantic sliding window, and offloads old logs to `bonsai_archive.md`. Also embeds Git hashes unconditionally for offline tracing.
4. **`manage_strict_rules` (Anti-Hallucination Guard)**
   - *What it does*: Mutates a strict rule array to build unbreakable laws across sessions.
5. **`set_focus_mode` (Dynamic Blinders)**
   - *What it does*: Forces the LLM to only inspect relevant contexts via a temporary `bonsai_focus.md`, reducing inference overload on large setups.
6. **`preview_file_signatures` (AST Map Generator)**
   - *What it does*: Powerful AST parser (`ts.createSourceFile`). Rather than reading a 2000-line TypeScript file, this tool drops out the bodies, extracts `public` Class members, and captures `JSDoc` blocks natively. It implements strict token guardrails (max 15 methods).

---
### 🖥 Development
Want to extend the logic? Clone this repo and use:
```bash
cd server
npm i
npm run build
```
