# 🌳 Context Bonsai (MCP Server)

Context Bonsai is an autonomous **Model Context Protocol (MCP)** server designed to enforce state-machine logic and relieve token exhaustion by actively "pruning" dead conversation branches in Claude Code and Claude Desktop.

It provides Claude with a solid REST-like JSON API to document and summarize its actions, bypassing the need for manual, error-prone file text editing.

## Installation / Setup

You do not need to download or clone the repository to use the tools. You can inject this MCP server into your local environment simply by updating your global Claude settings (e.g., `~/.claude_code/config.json` or Claude Desktop `claude_desktop_config.json`) with the NPM package:

```json
"mcpServers": {
  "context-bonsai": {
    "command": "npx",
    "args": ["-y", "context-bonsai-mcp"]
  }
}
```
*Note: Restart Claude after updating the global config!*

## Available MCP Tools

Once installed, Claude gains autonomous access to 3 core context tools:

1. `read_project_state`: Fetches the `state.json` seamlessly without taking up massive token space reading file histories.
2. `update_project_state`: Fully-typed API with built-in array handlers allowing Claude to change the project phase, append/resolve known issues (`add_issue`, `resolve_issue_id`), and manage objectives (`add_objective`, `remove_objective`) safely without deleting data.
3. `prune_context_branch`: Triggers an autonomous slice of your conversational history. Drops the heavy context window and replaces a 50-message chat flow with a single highly dense "Root Cause, Solution, Files Mutated" hash inside `bonsai_logs.md`. Limits history to the latest 5 bugs (Rolling memory).

## Development

The project relies on `@modelcontextprotocol/sdk` and Zod.

```bash
cd server
npm run build
```
