# agentsync Phase 2: Multi-Agent Support (v0.2.0)

## Overview

Extend agentsync to support OpenCode, Gemini CLI, and Cursor — including their unique MCP config formats. Add diagnostic commands (`doctor`, `mcp diff`). Requires updates to the transformer, writer routing, and schema to handle new patterns: array commands, custom URL keys, optional transport type fields, and JSON merge write mode.

**Reference:** `PRD.md` (Phase 2 section)
**Prereq:** v0.1.0 MVP complete (all 57 tests passing)

---

## Tasks

```json
[
  {
    "id": "SCHEMA-001",
    "category": "setup",
    "priority": 1,
    "description": "Update TypeScript types to support Phase 2 agent config patterns",
    "steps": [
      "In src/schemas/agent-schema.ts, make TransportConfig.typeField and typeValue optional (some agents like Gemini omit the type field for stdio)",
      "Add optional urlKey?: string to TransportConfig (Gemini uses 'httpUrl' instead of 'url' for HTTP servers)",
      "Add writeMode: 'standalone' | 'merge' to MCPConfig ('standalone' = writeJSON overwrites entire file, 'merge' = mergeJSON preserves non-MCP keys)",
      "Update existing agent definitions: add writeMode 'standalone' to claude-code.json, add writeMode 'merge' to codex.json (TOML merge is already handled by format field, but explicit writeMode makes routing clearer)",
      "Run npx tsc --noEmit to verify types are clean"
    ],
    "passes": true
  },
  {
    "id": "XFORM-001",
    "category": "feature",
    "priority": 2,
    "description": "Update transformer to handle array commands, custom URL keys, and optional type fields",
    "steps": [
      "In src/mcp/transformer.ts transformServerInline(): when mcp.commandType === 'array', output command as [server.command, ...server.args] with no separate args field",
      "In transformServerInline(): use transportDef.urlKey (fallback 'url') for the HTTP URL field name instead of hardcoded 'url'",
      "In transformServerInline() and transformServerNamed(): skip setting type field when transportDef.typeField is undefined/empty",
      "Add test cases in src/mcp/__tests__/transformer.test.ts: array command output, custom urlKey ('httpUrl'), omitted type field",
      "Run npx tsc --noEmit and npx vitest run"
    ],
    "passes": true
  },
  {
    "id": "SYNC-001",
    "category": "feature",
    "priority": 3,
    "description": "Update mcp-sync command to support mergeJSON write mode for agents that share config files",
    "steps": [
      "In src/commands/mcp-sync.ts, import mergeJSON from writer.ts",
      "Update the write routing: if format === 'toml' → writeTOML, else if writeMode === 'merge' → mergeJSON(targetPath, rootKey, servers), else → writeJSON(targetPath, rootKey, servers)",
      "Run npx tsc --noEmit"
    ],
    "passes": true
  },
  {
    "id": "AGENT-001",
    "category": "feature",
    "priority": 4,
    "description": "Create OpenCode agent definition (opencode.json) with array commands and {env:VAR} syntax",
    "steps": [
      "Create agents/opencode.json with: id 'opencode', name 'OpenCode'",
      "configDir: darwin/linux '~/.config/opencode', win32 '%APPDATA%/opencode'",
      "detect: directory-exists at '~/.config/opencode'",
      "portable: ['opencode.json', 'AGENTS.md']",
      "mcp: configPath 'opencode.json', writeMode 'merge', rootKey 'mcp', format 'json', envSyntax '{env:VAR}', envVarStyle 'inline', commandType 'array', envKey 'env'",
      "transports: stdio → { typeField: 'type', typeValue: 'local' }, http → { typeField: 'type', typeValue: 'remote', urlKey: 'url' }",
      "Verify the definition loads correctly with schema-loader",
      "Run npx tsc --noEmit"
    ],
    "passes": false
  },
  {
    "id": "AGENT-002",
    "category": "feature",
    "priority": 5,
    "description": "Create Gemini CLI agent definition (gemini-cli.json) with implicit transport and httpUrl",
    "steps": [
      "Create agents/gemini-cli.json with: id 'gemini-cli', name 'Gemini CLI'",
      "configDir: darwin/linux '~/.gemini', win32 '%APPDATA%/gemini'",
      "detect: directory-exists at '~/.gemini'",
      "portable: ['settings.json', 'GEMINI.md']",
      "mcp: configPath 'settings.json', writeMode 'merge', rootKey 'mcpServers', format 'json', envSyntax '${VAR}', envVarStyle 'inline', commandType 'string', envKey 'env'",
      "transports: stdio → {} (no type field — Gemini infers from command presence), http → { urlKey: 'httpUrl' } (no type field, URL field is 'httpUrl')",
      "Verify the definition loads correctly with schema-loader",
      "Run npx tsc --noEmit"
    ],
    "passes": false
  },
  {
    "id": "AGENT-003",
    "category": "feature",
    "priority": 6,
    "description": "Create Cursor agent definition (cursor.json) with ${env:VAR} syntax",
    "steps": [
      "Create agents/cursor.json with: id 'cursor', name 'Cursor'",
      "configDir: darwin/linux '~/.cursor', win32 '%APPDATA%/cursor'",
      "detect: directory-exists at '~/.cursor'",
      "portable: ['rules/**']",
      "mcp: configPath 'mcp.json', writeMode 'standalone', rootKey 'mcpServers', format 'json', envSyntax '${env:VAR}', envVarStyle 'inline', commandType 'string', envKey 'env'",
      "transports: stdio → { typeField: 'type', typeValue: 'stdio' }, http → { typeField: 'type', typeValue: 'http' }",
      "credentials: [] (Cursor credentials stored in app, not config dir)",
      "Verify the definition loads correctly with schema-loader",
      "Run npx tsc --noEmit"
    ],
    "passes": false
  },
  {
    "id": "TEST-002",
    "category": "test",
    "priority": 7,
    "description": "Add snapshot tests for OpenCode, Gemini CLI, and Cursor MCP transformations",
    "steps": [
      "In src/mcp/__tests__/transformer.test.ts, add test suite for OpenCode: verify array command output [command, ...args], {env:VAR} syntax, local/remote transport types, mcp root key",
      "Add test suite for Gemini CLI: verify ${VAR} syntax, omitted type fields, httpUrl for HTTP servers, mcpServers root key",
      "Add test suite for Cursor: verify ${env:VAR} syntax, standard transport types, mcpServers root key",
      "Add test for mergeJSON routing: ensure mcp-sync would call mergeJSON for agents with writeMode 'merge'",
      "Update schema-loader tests to expect 5 agent definitions (up from 2)",
      "Run npx vitest run — all tests must pass"
    ],
    "passes": false
  },
  {
    "id": "FEAT-008",
    "category": "feature",
    "priority": 8,
    "description": "Implement `agentsync doctor` command for diagnosing config health",
    "steps": [
      "Create src/commands/doctor.ts",
      "Check 1 — Broken symlinks: for each enabled agent, check if symlinked files point to valid targets",
      "Check 2 — Credentials in repo: scan repo dir for files matching agent credential patterns (e.g. ~/.claude.json accidentally copied)",
      "Check 3 — Stale configs: for each linked agent, check if symlink targets actually exist in repo",
      "Check 4 — MCP config freshness: compare mcp.json mtime vs generated MCP file mtimes, warn if generated files are older",
      "Show colored diagnostic output: ✓ for healthy, ✗ for issues, with fix suggestions",
      "Wire up in src/cli.ts as 'agentsync doctor'",
      "Run npx tsc --noEmit"
    ],
    "passes": false
  },
  {
    "id": "FEAT-009",
    "category": "feature",
    "priority": 9,
    "description": "Implement `agentsync mcp diff` command to preview MCP sync changes",
    "steps": [
      "Create src/commands/mcp-diff.ts",
      "Parse mcp.json and transform for each enabled agent (reuse transformForAgent)",
      "Read existing agent MCP config files (if they exist)",
      "For JSON: compare serialized JSON strings, show added/removed/changed servers",
      "For TOML: compare serialized TOML strings for the mcp_servers section only",
      "Show colored diff output per agent: green for additions, red for removals, yellow for changes",
      "If no changes, show 'All agents up to date'",
      "Wire up in src/cli.ts as 'agentsync mcp diff'",
      "Run npx tsc --noEmit"
    ],
    "passes": false
  },
  {
    "id": "TEST-003",
    "category": "test",
    "priority": 10,
    "description": "Add tests for doctor and mcp diff commands",
    "steps": [
      "Create src/commands/__tests__/doctor.test.ts — test broken symlink detection, credential detection, stale config detection",
      "Create src/commands/__tests__/mcp-diff.test.ts — test diff output when configs are in sync, when servers added/removed, when no existing config",
      "Use tmp directories with controlled filesystem state for reliable testing",
      "Run npx vitest run — all tests must pass"
    ],
    "passes": false
  },
  {
    "id": "RELEASE-001",
    "category": "release",
    "priority": 11,
    "description": "Update README, bump version to 0.2.0, verify package",
    "steps": [
      "Update README.md supported agents table: add OpenCode, Gemini CLI, Cursor with their config details",
      "Add doctor and mcp diff to the commands table in README.md",
      "Bump version in package.json to 0.2.0",
      "Run npx tsc --noEmit",
      "Run npx vitest run — all tests must pass",
      "Run npm pack --dry-run — verify agents/opencode.json, agents/gemini-cli.json, agents/cursor.json included"
    ],
    "passes": false
  }
]
```
