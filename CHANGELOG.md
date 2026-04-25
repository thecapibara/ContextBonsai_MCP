# Changelog

## [2.0.1] - 2026-04-26
### Fixed
- **NPM Package**: Synced root README.md to the package directory to reflect the 8-tool Enterprise suite on the NPM registry.

## [2.0.0] - 2026-04-26
### Added
- **The RAG Engine (`query_bonsai_knowledge`)**: Added `minisearch` to perform zero-dependency local text searches over active and archived semantic logs. Safely returns historically solved tickets via LLM invocation.
- **Global AST Radar (`map_project_architecture`)**: Added a global directory scanner that uses AST to extract all `export` signatures across the codebase without loading file bodies.
- **Auto-Purge Focus**: `prune_context_branch` now automatically destroys the active `bonsai_focus.md` file, freeing LLM context bounds immediately after resolving the bug.
- **Dependency Mapping**: `preview_file_signatures` now dynamically extracts and compresses all file imports (`{ X, Y } from 'Z'`) into a 1-line native header, completely eliminating "Blind Spots" without costing heavy tokens.
- **Zero-Downtime Health Checks**: Context Bonsai server now runs a silent integrity check on `state.json` on boot. If corrupted via crash or LLM-hallucination, the server will instantly and silently self-heal using the `.bak` atomic backup before mounting the Stdio transport to the LLM.

## [1.4.2] - 2026-04-25
### Changed
- **Token Guardrails**: Added strict bounds to the AST parser to prevent massive files from generating equally massive signature maps. JSDoc strings are now truncated to their first summary line (omitting `@params`, `@returns`), and classes with more than 15 public methods will cleanly truncate the remaining members with a single line `// ... and X more members omitted`.

## [1.4.0] - 2026-04-25
### Added
- **AST JSDoc Preservation**: `preview_file_signatures` now dynamically extracts and prepends `/** ... */` JSDoc comments to function and class signatures, giving the LLM immediate context on parameter intent without reading the code block.
- **AST Class Member Traversal**: The signature parser now recursively drops into `ClassDeclaration` nodes, extracting all `public` and `protected` methods/properties while automatically filtering out `private` internal logic to ensure the exported API surface is perfectly isolated.

## [1.3.1] - 2026-04-25
### Changed
- **AST Signature Parser**: Completely refactored `preview_file_signatures`. Replaced naive string matching with official TypeScript compiler API (`ts.createSourceFile`). The tool now flawlessly parses multi-line signatures, ignores comments, avoids local variables, and accurately extracts `FunctionDeclaration`, `ClassDeclaration`, and schemas.

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
