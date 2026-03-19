# agentsync - Activity Log (Phase 3 v0.3.0)

## Current Status

**Last Updated:** 2026-03-19
**Tasks Completed:** 4/9
**Current Task:** FEAT-011 — Add JSON Schema validation for agent definition files

---

## Previous Work

- PRD.md created with full technical design, agent definitions schema, MCP normalization pipeline, and implementation plan.
- Git repo initialized at /Users/alex/Dev/agents-anywhere/

---

## Session Log

### 2026-03-17 — SETUP-001 (setup)
- Scaffolded TypeScript project with tsup, vitest, commander, and npm package config
- Initialized package.json with name `agentsync`, bin entry `dist/cli.js`, version 0.1.0
- Installed deps: commander, simple-git, smol-toml, yaml
- Installed devDeps: typescript, tsup, vitest, @types/node
- Created tsconfig.json (ES2022, NodeNext, strict mode)
- Created tsup.config.ts (cjs+esm, dts, shebang banner)
- Created src/cli.ts with commander skeleton: init, link, unlink, status, agents, mcp (sync, add, list)
- Created src/index.ts and src/version.ts
- `npx tsc --noEmit` passes clean
- **Files:** package.json, tsconfig.json, tsup.config.ts, src/cli.ts, src/index.ts, src/version.ts

### 2026-03-17 — SETUP-002 (setup)
- Created agent definition TypeScript types in src/schemas/agent-schema.ts (AgentDefinition, MCPConfig, TransportMap, PlatformPaths, etc.)
- Created src/core/schema-loader.ts with loadAllAgentDefinitions(), loadAgentDefinition(), loadAgentById(), and validation
- Created agents/claude-code.json with full agent definition matching PRD.md spec
- Created agents/codex.json with full agent definition for Codex CLI (TOML-based MCP config)
- Added build step to copy agents/ into dist/agents/ for runtime bundling
- Created src/core/__tests__/schema-loader.test.ts — 6 tests validating loading, field presence, by-ID lookup, and error handling
- `npx tsc --noEmit` passes clean, all 6 tests pass
- **Files:** src/schemas/agent-schema.ts, src/core/schema-loader.ts, src/core/__tests__/schema-loader.test.ts, agents/claude-code.json, agents/codex.json, package.json

### 2026-03-17 — FEAT-001 (feature)
- Implemented agent detector that scans filesystem for installed AI coding agents
- Created src/utils/paths.ts with expandPath() for ~ and %APPDATA% expansion, and getPlatformPath() for platform-specific config dir resolution
- Created src/core/detector.ts with detectAgents() and detectSingleAgent() functions returning DetectedAgent objects ({ definition, configDir, installed })
- Handles platform-specific configDir (darwin/linux/win32) via getPlatformPath utility
- Detection uses directory-exists rule with fs.existsSync on expanded paths
- Created src/core/__tests__/detector.test.ts with 7 tests — mocks fs.existsSync for detection paths while preserving real fs for schema-loader
- `npx tsc --noEmit` passes clean, all 13 tests pass (6 schema-loader + 7 detector)
- **Files:** src/utils/paths.ts, src/core/detector.ts, src/core/__tests__/detector.test.ts

### 2026-03-17 — FEAT-002 (feature)
- Implemented symlink manager for linking/unlinking agent configs to a central repo
- Created src/core/linker.ts with linkAgent(), unlinkAgent(), and getStatus() functions
- linkAgent() creates symlinks from agent configDir to repoDir/agentId/, backs up existing real files to .backup.{timestamp}, skips already-correct symlinks (idempotent)
- unlinkAgent() removes symlinks pointing to repo, restores most recent backup if available
- getStatus() returns per-item link status: linked, unlinked, diverged, or missing
- Helper utilities: isSymlinkTo(), findMostRecentBackup(), getPortableItems() (expands glob patterns to top-level items)
- Created src/core/__tests__/linker.test.ts with 12 tests — link creation, backup, idempotency, unlink with restore, status reporting
- `npx tsc --noEmit` passes clean, all 25 tests pass (13 existing + 12 linker)
- **Files:** src/core/linker.ts, src/core/__tests__/linker.test.ts

### 2026-03-17 — FEAT-003 (feature)
- Implemented MCP config normalizer — parse normalized mcp.json and transform to per-agent formats
- Created src/mcp/types.ts with NormalizedMCPConfig, NormalizedServer, EnvRef types for the canonical mcp.json format
- Created src/mcp/parser.ts with parseMCPConfig() and parseMCPConfigFromString() — validates structure, transport types, env refs
- Created src/mcp/transformer.ts with transformForAgent(config, agentDef) — core transformation engine
- Handles inline env syntax (Claude Code: `${VAR}`) and named env var style (Codex: `env_vars` array)
- Handles prefix in headers: `{ $env: 'TOKEN', prefix: 'Bearer ' }` → `Bearer ${TOKEN}` (inline) or `bearer_token_env_var` (named)
- Handles transport type mapping via agent definition transports config
- Handles command type, args, and URL for stdio/http transports
- Created src/mcp/__tests__/transformer.test.ts with 15 tests — Claude Code transform, Codex transform, parser validation, edge cases, snapshot tests
- `npx tsc --noEmit` passes clean, all 40 tests pass (25 existing + 15 new)
- **Files:** src/mcp/types.ts, src/mcp/parser.ts, src/mcp/transformer.ts, src/mcp/__tests__/transformer.test.ts

### 2026-03-17 — FEAT-004 (feature)
- Implemented MCP writer — write transformed configs to each agent's expected location and format
- Created src/mcp/writer.ts with three write functions:
  - writeJSON(path, rootKey, servers) — standalone JSON MCP config (Claude Code, Cursor, Windsurf), overwrites entire file
  - mergeJSON(path, key, servers) — merge MCP key into existing JSON file preserving other keys (Gemini, OpenCode)
  - writeTOML(path, servers) — merge [mcp_servers] section into existing TOML config without destroying other keys (Codex)
- All writers create parent directories if needed, use smol-toml for TOML read/write
- Created src/mcp/__tests__/writer.test.ts with 11 tests — JSON write/overwrite, JSON merge preserving keys, TOML merge preserving sections, TOML replacement, directory creation
- `npx tsc --noEmit` passes clean, all 51 tests pass (40 existing + 11 new)
- **Files:** src/mcp/writer.ts, src/mcp/__tests__/writer.test.ts

### 2026-03-17 — FEAT-005 (feature)
- Wired up CLI commands: init, link, unlink, status, agents
- Created src/utils/output.ts with colored console helpers (info, success, warn, error, heading, table, statusBadge) using ANSI escape codes
- Created src/utils/manifest.ts with loadManifest() to find and load agentsync.json from cwd or default ~/agentsync-config location
- Created src/commands/init.ts — detects agents, creates repo dir (default ~/agentsync-config), scaffolds agentsync.json manifest + mcp.json + .gitignore + per-agent dirs, runs git init, sets up post-merge hook for auto re-link/sync on pull
- Created src/commands/link.ts — links all enabled agents (or specific agent by ID), uses manifest to determine enabled agents, shows colored per-agent output with backup notifications
- Created src/commands/unlink.ts — unlinks all or specific agent, restores backups, shows colored per-agent output
- Created src/commands/status.ts — shows table of agents with per-item link status (linked, unlinked, diverged, missing)
- Created src/commands/agents.ts — lists all known agents with install status, link count for enabled agents
- Updated src/cli.ts to import and wire all command handlers, added optional [dir] argument to init command
- `npx tsc --noEmit` passes clean, all 51 tests pass (no new tests for this task — CLI commands are integration-level)
- **Files:** src/utils/output.ts, src/utils/manifest.ts, src/commands/init.ts, src/commands/link.ts, src/commands/unlink.ts, src/commands/status.ts, src/commands/agents.ts, src/cli.ts

### 2026-03-17 — FEAT-006 (feature)
- Wired up MCP CLI commands: mcp sync, mcp add, mcp list
- Created src/commands/mcp-sync.ts — reads mcp.json from repo, parses with parseMCPConfig, transforms for each enabled agent using transformForAgent, writes to agent config dirs using writeJSON (for JSON agents like Claude Code) or writeTOML (for TOML agents like Codex), shows colored per-agent summary
- Created src/commands/mcp-add.ts — interactive prompts via readline: transport type (stdio/http), command or URL, args, env vars (repeating loop), authorization header for http transport → appends server entry to mcp.json
- Created src/commands/mcp-list.ts — reads mcp.json, displays table of servers with name, transport type, command/URL, env vars, and header vars
- Updated src/cli.ts to import and wire all three MCP command handlers (replaced stub implementations)
- `npx tsc --noEmit` passes clean, all 51 tests pass (no new tests — CLI commands are integration-level)
- **Files:** src/commands/mcp-sync.ts, src/commands/mcp-add.ts, src/commands/mcp-list.ts, src/cli.ts

### 2026-03-17 — TEST-001 (test)
- Added end-to-end integration test for full init → link → mcp sync → unlink workflow
- Created src/__tests__/e2e.test.ts with 6 tests covering:
  - Init creates repo structure with manifest, mcp.json, .gitignore, per-agent dirs, git repo, and post-merge hook
  - Link creates symlinks from agent config dirs to repo for both Claude Code and Codex
  - MCP sync generates correct Claude Code .mcp.json with mcpServers root key and ${VAR} env syntax
  - MCP sync generates correct Codex config.toml with [mcp_servers] section and env_vars named style
  - Unlink removes symlinks and restores backed-up original files
  - Full integrated workflow test: init → link → mcp sync → verify outputs → unlink → verify cleanup
- Uses tmp directory as fake HOME, mocks os.homedir() for path resolution, verifies filesystem state
- `npx tsc --noEmit` passes clean, all 57 tests pass (51 existing + 6 new)
- **Files:** src/__tests__/e2e.test.ts

### 2026-03-17 — FEAT-007 (feature)
- Added README.md with project description, quick start guide, feature overview with MCP normalization example, commands table, supported agents table, repo structure, and contributing guide for agent definitions
- Added LICENSE file (MIT)
- Added .npmignore to exclude src/, test files, dev configs, and planning docs from published package
- `npx tsc --noEmit` passes clean, all 57 tests pass
- `npm pack --dry-run` confirms correct package contents (LICENSE, README.md, agents/, package.json)
- **Files:** README.md, LICENSE, .npmignore

### 2026-03-19 — SCHEMA-001 (setup)
- Updated TypeScript types to support Phase 2 agent config patterns
- Made TransportConfig.typeField and typeValue optional (some agents like Gemini infer transport implicitly)
- Added optional urlKey to TransportConfig (Gemini uses 'httpUrl' instead of 'url')
- Added writeMode: 'standalone' | 'merge' to MCPConfig for routing write behavior
- Updated transformer to guard against undefined typeField/typeValue and use urlKey for HTTP URLs
- Added writeMode 'standalone' to claude-code.json, writeMode 'merge' to codex.json
- `npx tsc --noEmit` passes clean, all 57 tests pass
- **Files:** src/schemas/agent-schema.ts, src/mcp/transformer.ts, agents/claude-code.json, agents/codex.json

### 2026-03-19 — XFORM-001 (feature)
- Updated transformer to support array command type: when commandType === 'array', outputs command as [command, ...args] with no separate args field
- urlKey and optional typeField support were already implemented in SCHEMA-001
- Added 7 new test cases covering: array command output (with/without args), custom urlKey ('httpUrl'), omitted type fields (implicit transport), env syntax with array commands, transport type values
- `npx tsc --noEmit` passes clean, all 64 tests pass (57 existing + 7 new)
- **Files:** src/mcp/transformer.ts, src/mcp/__tests__/transformer.test.ts

### 2026-03-19 — SYNC-001 (feature)
- Updated mcp-sync command to support mergeJSON write mode for agents that share config files
- Imported mergeJSON from writer.ts alongside existing writeJSON and writeTOML
- Updated write routing: format === 'toml' → writeTOML, writeMode === 'merge' → mergeJSON, else → writeJSON (standalone)
- This enables Phase 2 agents like OpenCode and Gemini CLI that merge MCP config into existing JSON files
- `npx tsc --noEmit` passes clean
- **Files:** src/commands/mcp-sync.ts

### 2026-03-19 — AGENT-001 (feature)
- Created OpenCode agent definition (agents/opencode.json)
- Configured array command type, {env:VAR} env syntax, inline envVarStyle
- configDir: ~/.config/opencode (darwin/linux), %APPDATA%/opencode (win32)
- MCP: merge writeMode, 'mcp' rootKey, JSON format, array commandType
- Transports: stdio → local (with type field), http → remote (with type field, url urlKey)
- Portable files: opencode.json, AGENTS.md
- Verified definition loads correctly via schema-loader tests
- `npx tsc --noEmit` passes clean, all 64 tests pass
- **Files:** agents/opencode.json

### 2026-03-19 — AGENT-002 (feature)
- Created Gemini CLI agent definition (agents/gemini-cli.json)
- Configured implicit transport (empty stdio transport config — Gemini infers from command presence)
- HTTP transport uses httpUrl as URL key instead of standard 'url'
- configDir: ~/.gemini (darwin/linux), %APPDATA%/gemini (win32)
- MCP: merge writeMode, 'mcpServers' rootKey, JSON format, ${VAR} env syntax, string commandType
- Portable files: settings.json, GEMINI.md
- Verified definition loads correctly via schema-loader tests
- `npx tsc --noEmit` passes clean, all 64 tests pass
- **Files:** agents/gemini-cli.json

### 2026-03-19 — AGENT-003 (feature)
- Created Cursor agent definition (agents/cursor.json)
- Configured ${env:VAR} env syntax, inline envVarStyle, standalone writeMode
- configDir: ~/.cursor (darwin/linux), %APPDATA%/cursor (win32)
- MCP: standalone writeMode, 'mcpServers' rootKey, JSON format, string commandType
- Transports: stdio → { type: 'stdio' }, http → { type: 'http' }
- Credentials: [] (stored in app, not config dir)
- Portable files: rules/**
- Verified definition loads correctly via schema-loader tests
- `npx tsc --noEmit` passes clean, all 64 tests pass
- **Files:** agents/cursor.json

### 2026-03-19 — TEST-002 (test)
- Added snapshot tests for OpenCode, Gemini CLI, and Cursor MCP transformations
- OpenCode tests: verify array command output [command, ...args], {env:VAR} syntax, local/remote transport types, mcp root key
- Gemini CLI tests: verify ${VAR} syntax, omitted type fields (implicit transport), httpUrl for HTTP servers, mcpServers root key
- Cursor tests: verify ${env:VAR} syntax, standard stdio/http transport types, mcpServers root key
- Added mergeJSON routing test: verifies writeMode 'merge' on OpenCode/Gemini CLI and 'standalone' on Cursor/Claude Code
- Updated schema-loader tests to expect exactly 5 agent definitions (claude-code, codex, opencode, gemini-cli, cursor)
- `npx tsc --noEmit` passes clean, all 74 tests pass (64 existing + 10 new)
- **Files:** src/mcp/__tests__/transformer.test.ts, src/core/__tests__/schema-loader.test.ts

### 2026-03-19 — FEAT-008 (feature)
- Implemented `agentsync doctor` command for diagnosing config health
- Check 1 — Broken symlinks: detects symlinks in agent config dirs pointing to non-existent targets
- Check 2 — Credentials in repo: scans repo root and agent subdirs for credential files (e.g. .claude.json)
- Check 3 — Stale configs: detects symlinked items whose repo-side source files are missing
- Check 4 — MCP config freshness: compares mcp.json mtime vs generated MCP config mtimes, warns if stale
- Colored diagnostic output: green checkmark for healthy checks, red X for issues with fix suggestions
- Wired up in src/cli.ts as `agentsync doctor`
- Exported individual check functions for testability
- `npx tsc --noEmit` passes clean, all 74 tests pass
- **Files:** src/commands/doctor.ts, src/cli.ts

### 2026-03-19 — FEAT-009 (feature)
- Implemented `agentsync mcp diff` command to preview what `mcp sync` would change
- Parses mcp.json, transforms for each enabled agent (reuses transformForAgent), reads existing agent MCP config files
- For JSON: reads servers under rootKey, compares serialized server entries
- For TOML: reads mcp_servers section, compares serialized server entries
- Shows colored per-agent diff: green for additions, red for removals, yellow for changes
- If no changes across all agents, shows "All agents up to date"
- Exported diffServers() for testability
- Wired up in src/cli.ts as `agentsync mcp diff`
- `npx tsc --noEmit` passes clean, all 74 tests pass
- **Files:** src/commands/mcp-diff.ts, src/cli.ts

### 2026-03-19 — TEST-003 (test)
- Added tests for doctor command: broken symlink detection (3 tests), credential detection (4 tests), stale config detection (3 tests), MCP config freshness (4 tests)
- Added tests for mcp diff command: diffServers function with 7 tests covering null existing, identical configs, added/removed/changed servers, mixed scenarios, empty edge cases
- All tests use tmp directories with controlled filesystem state for reliable, isolated testing
- `npx tsc --noEmit` passes clean, all 96 tests pass (74 existing + 22 new)
- **Files:** src/commands/__tests__/doctor.test.ts, src/commands/__tests__/mcp-diff.test.ts

### 2026-03-19 — RELEASE-001 (release)
- Updated README.md supported agents table: added OpenCode, Gemini CLI, Cursor with config details
- Updated MCP normalization table and pipeline diagram with all 5 agents
- Added `doctor` and `mcp diff` to the commands table in README.md
- Bumped version in package.json and src/version.ts to 0.2.0
- `npx tsc --noEmit` passes clean, all 96 tests pass
- `npm pack --dry-run` confirms agents/opencode.json, agents/gemini-cli.json, agents/cursor.json included
- **Files:** README.md, package.json, src/version.ts, plan.md, activity.md

### 2026-03-19 — Code Review Fixes (post-release)
- Fixed 10 code review issues across critical, high, and medium severity
- Critical: version hardcoded as "0.1.0" → now uses version.ts; program.parse() → parseAsync() with error handler
- High: writeTOML parameterized with rootKey; mcp-diff uses serverSection/rootKey for TOML; mergeJSON try/catch; resolveEnvRef guards against missing VAR placeholder
- Medium: removed dead imports in link.ts/unlink.ts; refactored link/unlink to pass AgentDefinition directly (eliminating redundant loadAgentById calls); added loadAllAgentDefinitions cache; validated writeMode/commandType in schema-loader; guarded table() empty array; exported getPortableItems from linker (deduplicated from doctor); APPDATA throws on win32; manifest try/catch + always derives repoDir from file location (path traversal fix); mcp-add env var loop break→warn+continue
- Removed unused yaml dependency
- Test fixes: writeTOML calls updated for new signature; temp dirs moved to os.tmpdir(); added mcpSyncCommand integration test and mergeJSON routing test (98 tests total)
- Created DEVELOPMENT.md developer guide
- Updated README.md agent definition example with scope, writeMode, envVarStyle fields
- **Files:** src/cli.ts, src/mcp/writer.ts, src/commands/mcp-sync.ts, src/commands/mcp-diff.ts, src/mcp/transformer.ts, src/commands/link.ts, src/commands/unlink.ts, src/commands/doctor.ts, src/commands/mcp-add.ts, src/core/linker.ts, src/core/schema-loader.ts, src/utils/output.ts, src/utils/manifest.ts, src/utils/paths.ts, package.json, src/mcp/__tests__/writer.test.ts, src/commands/__tests__/doctor.test.ts, src/__tests__/e2e.test.ts, README.md, DEVELOPMENT.md

### 2026-03-19 — AGENT-004 (feature)
- Created Windsurf agent definition (agents/windsurf.json)
- Configured ${env:VAR} env syntax, inline envVarStyle, standalone writeMode
- configDir: ~/.codeium/windsurf (darwin/linux), %APPDATA%/codeium/windsurf (win32)
- MCP: standalone writeMode, 'mcpServers' rootKey, JSON format, string commandType
- HTTP transport uses 'serverUrl' as URL key instead of standard 'url'
- Transports: stdio → { type: 'stdio' }, http → { type: 'http', urlKey: 'serverUrl' }
- Portable files: mcp_config.json, memories/**, rules/**
- Updated schema-loader tests to expect 6 agent definitions (up from 5)
- `npx tsc --noEmit` passes clean, all 98 tests pass
- **Files:** agents/windsurf.json, src/core/__tests__/schema-loader.test.ts

### 2026-03-19 — TEST-004 (test)
- Added snapshot tests for Windsurf MCP transformation in transformer.test.ts
- Test stdio server: verifies ${env:VAR} syntax, standard transport types (type: "stdio"), mcpServers root key
- Test http server: verifies serverUrl key for HTTP URL (not 'url'), standard transport type (type: "http"), Bearer header with ${env:VAR} syntax
- Added snapshot test for full Windsurf output
- Added Windsurf to mergeJSON routing test as standalone writeMode agent
- Schema-loader tests already expected 6 agent definitions (done in AGENT-004)
- `npx tsc --noEmit` passes clean, all 101 tests pass (98 existing + 3 new)
- **Files:** src/mcp/__tests__/transformer.test.ts

### 2026-03-19 — FEAT-010 (feature)
- Added `--dry-run` flag to `link`, `unlink`, and `mcp sync` commands
- In `src/core/linker.ts`: added `dryRun` parameter (default false) to `linkAgent()` and `unlinkAgent()`. When true, computes results without calling `symlinkSync`, `renameSync`, `unlinkSync`, or `mkdirSync`. Returns the same `LinkResult[]`/`UnlinkResult[]` arrays.
- In `src/commands/link.ts`: accepts `dryRun` option, passes to `linkAgent()`, prefixes output with `[dry-run]` when active
- In `src/commands/unlink.ts`: accepts `dryRun` option, passes to `unlinkAgent()`, prefixes output with `[dry-run]`
- In `src/commands/mcp-sync.ts`: accepts `dryRun` option, skips writer calls (`writeJSON`/`mergeJSON`/`writeTOML`) when true, shows "would write" instead of "wrote"
- In `src/cli.ts`: wired `--dry-run` option to all three commands using Commander `.option()`
- `npx tsc --noEmit` passes clean, all 101 tests pass
- **Files:** src/core/linker.ts, src/commands/link.ts, src/commands/unlink.ts, src/commands/mcp-sync.ts, src/cli.ts

### 2026-03-19 — TEST-005 (test)
- Added dry-run tests for linkAgent and unlinkAgent in linker.test.ts
- linkAgent dryRun tests: returns "linked" results without creating symlinks, returns "backed-up-and-linked" without creating backups or symlinks, handles directories correctly
- unlinkAgent dryRun tests: returns "unlinked" without removing symlinks, returns "restored" without removing symlinks or restoring backups
- Added e2e test: linkAgent with dryRun=true on Claude Code definition returns results but creates zero symlinks in config dir
- `npx tsc --noEmit` passes clean, all 107 tests pass (101 existing + 6 new)
- **Files:** src/core/__tests__/linker.test.ts, src/__tests__/e2e.test.ts
