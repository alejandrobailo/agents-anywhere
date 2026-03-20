# agentsync - Activity Log (Phase 4 v0.4.0)

## Current Status

**Last Updated:** 2026-03-20
**Tasks Completed:** 1/8
**Current Task:** FEAT-013 — Add `agentsync init --from <git-url>`

---

## Previous Phases

- **Phase 1 (v0.1.0):** Project scaffold, agent schema loader, detector, linker, MCP normalizer/transformer/writer, CLI commands (init, link, unlink, status, agents, mcp sync/add/list), e2e tests, README + LICENSE. 2 agents (claude-code, codex). 57 tests.
- **Phase 2 (v0.2.0):** Schema updates for new agent patterns, array command type, mergeJSON write mode, 3 new agents (opencode, gemini-cli, cursor), doctor command, mcp diff command, snapshot tests. 96 tests.
- **Phase 3 (v0.3.0):** Windsurf agent, --dry-run mode, JSON Schema validation, validate command, export command. 131 tests. Post-release code review fixed: schema bundling (inlined as TS const), additionalProperties validation, heredoc injection safety, duplicate getAgentsDir removal, missing test fields. 137 tests.

---

## Session Log

### 2026-03-20 — FIX-001: Fix double shebang in build output
- **Category:** fix
- **Changes:** Removed `#!/usr/bin/env node` from line 1 of `src/cli.ts`. The shebang is already added by tsup's `banner` config in `tsup.config.ts`, so both were emitting it, causing a double shebang in `dist/cli.js` that broke `node dist/cli.js`.
- **Files modified:** `src/cli.ts`
- **Verification:** `head -3 dist/cli.js` shows exactly one shebang. `node dist/cli.js validate` runs without errors. 137 tests pass.
