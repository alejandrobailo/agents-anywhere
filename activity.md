# agentsync - Activity Log (Phase 4 v0.4.0)

## Current Status

**Last Updated:** 2026-03-20
**Tasks Completed:** 6/8
**Current Task:** DOCS-001 — Update DEVELOPMENT.md with code review changes and new files

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

### 2026-03-20 — FEAT-013: Add `init --from <git-url>`
- **Category:** feature
- **Changes:** Added `--from <url>` option to the `init` command. When provided, clones the given git URL to the target directory (default `~/agentsync-config`), verifies the cloned repo contains `agentsync.json`, and prints instructions to link and sync. If target already has `agentsync.json`, warns and exits early. If the cloned repo has no `agentsync.json`, throws an error.
- **Files modified:** `src/cli.ts`, `src/commands/init.ts`
- **Verification:** `npx tsc --noEmit` passes. 137 tests pass.

### 2026-03-20 — TEST-008: Add tests for `init --from` command
- **Category:** test
- **Changes:** Added 3 tests for the `init --from` feature: (1) cloning a valid agentsync config repo via local path, (2) error when cloned repo has no agentsync.json, (3) warn and exit early when target already has agentsync.json. Tests create real git repos in temp directories using simple-git.
- **Files modified:** `src/commands/__tests__/init.test.ts` (new)
- **Verification:** `npx tsc --noEmit` passes. 140 tests pass.

### 2026-03-20 — FEAT-014: Add non-interactive `mcp add` with CLI flags
- **Category:** feature
- **Changes:** Added CLI flags to `mcp add` command: `--transport <type>`, `--command <cmd>`, `--url <url>`, `--args <csv>`, `--env <pair...>`. When sufficient flags are provided (--transport + --command for stdio, or --transport + --url for http), the command skips interactive prompts entirely. Extracted `buildServerFromFlags()` as a named export for testability. The `--env` flag accepts repeatable KEY=VAR pairs. Insufficient flags fall through to interactive mode.
- **Files modified:** `src/cli.ts`, `src/commands/mcp-add.ts`
- **Verification:** `npx tsc --noEmit` passes. 140 tests pass.

### 2026-03-20 — TEST-009: Add tests for non-interactive `mcp add`
- **Category:** test
- **Changes:** Added 8 tests for `buildServerFromFlags()`: stdio with command/args/env, http with url, missing --command for stdio returns null, missing --url for http returns null, multiple --env flags parsed correctly, no transport returns null, invalid transport returns null, stdio without optional args/env.
- **Files modified:** `src/commands/__tests__/mcp-add.test.ts` (new)
- **Verification:** `npx tsc --noEmit` passes. 148 tests pass.

### 2026-03-20 — TEST-010: Add tests for status, agents, and mcp-list commands
- **Category:** test
- **Changes:** Added 3 test files: (1) `status.test.ts` — 4 tests covering no manifest, empty agents, per-agent link status display, and missing agent definition warning. (2) `agents.test.ts` — 3 tests covering installed/not-installed display, fully linked badge, and partial link count. (3) `mcp-list.test.ts` — 4 tests covering server listing with transport/env info, empty servers warning, invalid mcp.json error, and http server url display. Uses vi.mock for status/agents tests and real temp dirs with process.chdir for mcp-list tests.
- **Files modified:** `src/commands/__tests__/status.test.ts` (new), `src/commands/__tests__/agents.test.ts` (new), `src/commands/__tests__/mcp-list.test.ts` (new)
- **Verification:** `npx tsc --noEmit` passes. 159 tests pass.
