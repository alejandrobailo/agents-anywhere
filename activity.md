# agentsync - Activity Log (MVP v0.1.0)

## Current Status

**Last Updated:** 2026-03-17
**Tasks Completed:** 4/10
**Current Task:** FEAT-003

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
