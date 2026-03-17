# agentsync - Activity Log (MVP v0.1.0)

## Current Status

**Last Updated:** 2026-03-17
**Tasks Completed:** 2/10
**Current Task:** FEAT-001

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
