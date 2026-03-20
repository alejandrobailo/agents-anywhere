# agentsync Phase 4: Robustness & `init --from` (v0.4.0)

## Overview

Fix the build bug, add the most-requested missing feature (`init --from <git-url>`), add non-interactive `mcp add` for scripting, and harden test coverage for untested commands. Prepare the CLI for broader adoption.

**Reference:** `PRD.md` (Phase 4 section), `DEVELOPMENT.md` (architecture + conventions)
**Prereq:** v0.3.0 complete + code review fixes (137 tests passing, 6 agents supported)

---

## Tasks

```json
[
  {
    "id": "FIX-001",
    "category": "fix",
    "priority": 1,
    "description": "Fix double shebang in dist/cli.js build output",
    "steps": [
      "The bug: src/cli.ts has `#!/usr/bin/env node` on line 1, AND tsup.config.ts has `banner: { js: '#!/usr/bin/env node' }`. Both get emitted, producing a double shebang that crashes `node dist/cli.js`.",
      "Remove the `#!/usr/bin/env node` line from src/cli.ts (line 1). Let tsup's banner handle it.",
      "The banner also adds a shebang to dist/index.js (library entry) — this is harmless since Node.js strips hashbang comments before parsing.",
      "Verify: `npm run build && head -3 dist/cli.js` should show exactly ONE shebang followed by 'use strict'.",
      "Verify: `node dist/cli.js validate` should work without syntax errors.",
      "Run npx tsc --noEmit && npx vitest run"
    ],
    "passes": true
  },
  {
    "id": "FEAT-013",
    "category": "feature",
    "priority": 2,
    "description": "Add `agentsync init --from <git-url>` to clone an existing config repo",
    "steps": [
      "In src/cli.ts: add `--from <url>` option to the init command",
      "In src/commands/init.ts: add a new code path when `--from` is provided:",
      "  1. Use simple-git to `git clone <url> <targetDir>` (targetDir defaults to ~/agentsync-config)",
      "  2. Verify that agentsync.json exists in the cloned repo — if not, error with 'Not an agentsync config repo'",
      "  3. Print success message: 'Cloned config repo to <dir>'",
      "  4. Print: 'Run `agentsync link && agentsync mcp sync` to connect your agents.'",
      "If the target directory already contains agentsync.json, warn and exit (same as current behavior)",
      "Run npx tsc --noEmit"
    ],
    "passes": true
  },
  {
    "id": "TEST-008",
    "category": "test",
    "priority": 3,
    "description": "Add tests for `init --from` command",
    "steps": [
      "Create src/commands/__tests__/init.test.ts",
      "Test setup: create a temp directory, create a valid agentsync repo structure (agentsync.json + mcp.json), init as git repo, make initial commit",
      "Test: init --from with a local file:// URL clones the repo and agentsync.json is present in the target",
      "Test: init --from with a repo that has no agentsync.json errors with the expected message",
      "Test: init --from when target dir already has agentsync.json warns and exits early",
      "Use temp directories in os.tmpdir() for both source and target repos",
      "Run npx vitest run — all tests must pass"
    ],
    "passes": true
  },
  {
    "id": "FEAT-014",
    "category": "feature",
    "priority": 4,
    "description": "Add non-interactive `mcp add` with CLI flags for scripting",
    "steps": [
      "In src/cli.ts: add options to the `mcp add` command: --transport <type>, --command <cmd>, --url <url>, --args <csv>, --env <KEY=VAR> (repeatable via Commander's variadic option or .option('--env <pair...>'))",
      "In src/commands/mcp-add.ts: detect when all required flags are present (--transport + either --command or --url) and skip interactive prompts",
      "For stdio: require --transport stdio --command <cmd>. --args is optional (comma-separated).",
      "For http: require --transport http --url <url>.",
      "--env accepts KEY=VAR pairs: `--env GITHUB_TOKEN=GITHUB_TOKEN --env ANOTHER=VALUE`",
      "When flags are insufficient (e.g. --transport but no --command), fall through to interactive mode",
      "Run npx tsc --noEmit"
    ],
    "passes": true
  },
  {
    "id": "TEST-009",
    "category": "test",
    "priority": 5,
    "description": "Add tests for non-interactive `mcp add`",
    "steps": [
      "Create src/commands/__tests__/mcp-add.test.ts",
      "Extract the non-interactive server-building logic into a testable function (e.g. buildServerFromFlags()) that returns a NormalizedServer",
      "Test: stdio server with --transport stdio --command npx --args '-y,@mcp/server-github' --env GITHUB_TOKEN=GITHUB_TOKEN produces correct NormalizedServer",
      "Test: http server with --transport http --url https://example.com produces correct NormalizedServer",
      "Test: missing --command for stdio returns null/error",
      "Test: missing --url for http returns null/error",
      "Test: multiple --env flags are parsed correctly",
      "Run npx vitest run — all tests must pass"
    ],
    "passes": true
  },
  {
    "id": "TEST-010",
    "category": "test",
    "priority": 6,
    "description": "Add tests for status, agents, and mcp-list commands",
    "steps": [
      "Create src/commands/__tests__/status.test.ts — mock loadManifest() and loadAgentById() to return controlled data, mock getStatus() to return known link statuses, capture console.log output, verify heading + per-agent status lines",
      "Create src/commands/__tests__/agents.test.ts — mock detectAgents() to return a mix of installed/not-installed agents, capture console output, verify agent names and install badges appear",
      "Create src/commands/__tests__/mcp-list.test.ts — create a temp agentsync repo with a real mcp.json containing 2 servers, mock process.cwd() to point there, call mcpListCommand(), verify server names and transport info appear in output",
      "Run npx vitest run — all tests must pass"
    ],
    "passes": false
  },
  {
    "id": "DOCS-001",
    "category": "docs",
    "priority": 7,
    "description": "Update DEVELOPMENT.md with code review changes and new files",
    "steps": [
      "Add src/schemas/agent-definition-schema-data.ts to the project structure (note: inlined schema for bundle compatibility)",
      "Add src/commands/__tests__/validate.test.ts to the test table",
      "Add src/commands/__tests__/init.test.ts, mcp-add.test.ts, status.test.ts, agents.test.ts, mcp-list.test.ts to the test table",
      "Note in the Build section that the JSON Schema is inlined as a TS constant (not read from disk at runtime) for bundle compatibility",
      "Note that getAgentsDir() is exported from schema-loader.ts and shared by validate.ts",
      "Run npx tsc --noEmit"
    ],
    "passes": false
  },
  {
    "id": "RELEASE-003",
    "category": "release",
    "priority": 8,
    "description": "Bump to v0.4.0, update README, verify package",
    "steps": [
      "Bump version in package.json and src/version.ts to 0.4.0",
      "Add `init --from` to the README commands table and Quick Start section",
      "Add non-interactive mcp add example to README",
      "Run npx tsc --noEmit",
      "Run npx vitest run — all tests must pass",
      "Run npm run build && node dist/cli.js validate — verify no double shebang",
      "Run npm pack --dry-run — verify package contents"
    ],
    "passes": false
  }
]
```
