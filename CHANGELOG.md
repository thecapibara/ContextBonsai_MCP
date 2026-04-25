# Changelog

## [1.3.0] - 2026-04-25
### Added
- **MCP Enterprise Survival Suite**:
  - `manage_strict_rules`: Added persistent rule management in `state.json` (`strict_rules` array) to combat LLM hallucinations and enforce codebase conventions.
  - `set_focus_mode`: Added dynamic context blinders. Forces the MCP to export only topic-specific logs into a temporary `bonsai_focus.md` to drastically cut token consumption during hyper-focused tasks.
  - `preview_file_signatures`: Added AST approximation tool that extracts only function/class/interface signatures from JS/TS files, stripping the body logic, allowing the LLM to understand huge files without wasting tokens.

## [1.2.0] - 2026-04-25
### Added
- **Deep Archive**: Automatic offloading of older Evergreen logs (🌟) to `bonsai_archive.md` when a topic's critical log count exceeds 5. This prevents context bloat while preserving 100% of the history.

## [1.1.0] - 2026-04-25
### Added
- **Deep Archive**: Automatic offloading of older Evergreen logs (🌟) to `bonsai_archive.md` when a topic's critical log count exceeds 5. This prevents context bloat while preserving 100% of the history.

## [1.0.9] - 2026-04-25
### Added
- **Evergreen Logs**: Introduced `is_critical` flag for branches. Critical logs (🌟) bypass the pruning limit to prevent knowledge degradation.
- **Schema Versioning**: Added `schema_version` to `state.json` to enable future automated migrations and data portability.

## [1.0.8] - 2026-04-25
### Added
- **Concurrency Queue**: All file writes are now serialized via a singleton promise queue to prevent race conditions.
- **Collision Protection**: Unique temporary filenames (randomized) used during atomic writes to prevent locking issues.
- **Strict Tag Validation**: `prune_context_branch` now enforces a specific set of tags via Zod Enum.

## [1.0.7] - 2026-04-25
### Added
- **Atomic Writes**: Implemented write-to-temp-and-rename pattern to prevent file corruption during crashes.
- **Auto-Backups**: Server now automatically maintains `.bak` files for `state.json` and `bonsai_logs.md` on every write.
- **Tag Discipline**: Standardized a set of recommended semantic topics (`Logic`, `UI`, `Database`, `Auth`, `Infra`).

## [1.0.6] - 2026-04-25
### Added
- **Topic-Based Semantic Grouping**: Logs are now clustered by semantic domain (e.g., 'Auth', 'UI').
- **Isolated Pruning**: Each topic maintains its own history limit (3 logs), preventing cross-topic data loss.

## [1.0.4] - 2026-04-25
### Fixed
- Included `README.md` in the NPM package distribution for better registry visibility.

## [1.0.3] - 2026-04-25
### Added
- Native Array Mutation logic (`add_objective`, `remove_objective`, `add_issue`, `resolve_issue_id`).
- Fully bypassed LLM text-editor interactions for `state.json` to prevent data loss.

## [1.0.2] - 2026-04-25
### Fixed
- Hardened `ENOENT` state JSON parsing to stop silent overwriting if syntax is corrupted by the LLM.
- Refactored token rolling window (limiting `bonsai_logs.md` strictly to the 5 most recent bugs) to prevent token exhaustion.
- Fixed TypeScript ESM `node:` typing protocol for compilation.

## [1.0.0] - 2026-04-25
### Added
- Initial MCP package implementation and Zod schemas.
- Base `CLAUDE.md` project manifesto created.
