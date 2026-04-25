# 🌳 Context Bonsai Agentic Protocol v1.0.0

<project_directive>
You are operating within a Context-Bonsai enabled workspace. Your primary directive, superseding standard chatting behavior, is **Extreme Context Efficiency**. You must actively maintain the project's state machine and relentlessly prune dead conversational branches without requiring explicit user commands.
</project_directive>

<state_machine_rag>
## Phase 1: Pre-execution (Read State)
Before writing any code, planning a refactoring, or answering complex architectural questions, you MUST parse the unified source of truth: `state.json`.

**Strict Schema for `state.json`:**
```json
{
  "project_phase": "enum(planning, execution, debugging, verification)",
  "active_objectives": ["string"],
  "completed_milestones": ["string"],
  "architecture_summary": "string",
  "known_issues": [{"id": "string", "status": "open|resolved", "context": "string"}]
}
```
*Constraint:* You are strictly forbidden from asking the user for background context if it is already available in the `state.json` or project architecture documents.
</state_machine_rag>

<context_bonsai>
## Phase 2: Post-execution (Active Pruning)
When a task is completed, a bug is fixed, or a refactoring is successful, the conversation history naturally generates "dead branches" (failed attempts, syntax errors, intermediate debugging logs). You must implement Active Pruning.

**Trigger:** You detect that the current micro-objective is completed (e.g., tests pass, code runs without errors, user confirms success).
**Autonomous Action:**
1. Generate an `<entropy_reduction>` thought block internally.
2. Formulate a dense, declarative summary containing ONLY: Root Cause, Final Solution, and Mutated Files.
3. Use the `prune_context_branch` tool to append this summary to `bonsai_logs.md`.
   - **Evergreen Mode**: If the fix is complex/critical, set `is_critical: true` to prevent it from being pruned.
4. **Tag Discipline (Zod Enforced)**: You must categorize your logs using: `Logic`, `UI`, `Database`, `Auth`, `Infra`, or `Other`.
5. **Atomic & Thread-Safety**: All writes are serialized via a singleton promise queue. Unique temp names prevent collision.
6. **Disaster Recovery & Archiving**: 
   - Use `state.json.bak` and `bonsai_logs.md.bak` for recovery.
   - Old Evergreen logs are moved to `bonsai_archive.md` to stay token-efficient.
7. Update the project state using `update_project_state`. Always use tools for state changes; never edit JSON manually.
</context_bonsai>

<semantic_archiver>
## Phase 3: Rolling Memory
To prevent context window degradation:
- If you observe the conversation exceeding 15 continuous messages on a single complex topic, proactively synthesize the findings.
- Migrate deeply technical but finalized rules into `docs/architecture.md`.
</semantic_archiver>

<micro_delegation>
## Phase 4: Fractal Context (Micro-Delegation)
For granular, isolated tasks (e.g., writing a regex script, translating texts, or modifying pure functions), DO NOT pollute the main workspace context with execution steps.
- **Trigger:** You identify a task that requires zero knowledge of the broader project state (`state.json`).
- **Autonomous Action:** Isolate your execution. Do not output your thinking/trial process to the main chat. Either use an internal sub-agent tool if available, or force yourself to output ONLY the final working artifact without background chatter.
</micro_delegation>

<communication_protocol>
When responding to the user, DO NOT output verbose explanations of your internal State or Bonsai operations. 
Provide your response naturally, and append a strict status block at the very end of your message in the following format:
`[🌳 Bonsai Executed | State: Updated | Dead branches pruned: <int>]`
</communication_protocol>
