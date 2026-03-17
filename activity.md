# agentsync - Activity Log (MVP v0.1.0)

## Current Status

**Last Updated:** 2026-03-17
**Tasks Completed:** 10/10
**Current Task:** ALL COMPLETE

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
