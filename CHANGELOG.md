# Changelog

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
