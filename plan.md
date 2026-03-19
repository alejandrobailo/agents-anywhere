# agentsync Phase 3: Polish (v0.3.0)

## Overview

Expand agent coverage with Windsurf. Add `agentsync export` for shareable install scripts, JSON Schema validation for agent definitions, and `--dry-run` mode across all mutating commands. Improve robustness and developer experience.

**Reference:** `PRD.md` (Phase 3 section), `DEVELOPMENT.md` (architecture + conventions)
**Prereq:** v0.2.0 complete (98 tests passing, 5 agents supported)

---

## Tasks

```json
[
  {
    "id": "AGENT-004",
    "category": "feature",
    "priority": 1,
    "description": "Create Windsurf agent definition (windsurf.json)",
    "steps": [
      "Create agents/windsurf.json following the existing pattern in agents/cursor.json",
      "id: 'windsurf', name: 'Windsurf'",
      "configDir: darwin '~/.codeium/windsurf', linux '~/.codeium/windsurf', win32 '%APPDATA%/codeium/windsurf'",
      "detect: directory-exists at '~/.codeium/windsurf'",
      "portable: ['mcp_config.json', 'memories/**', 'rules/**']",
      "ignore: ['cache/**', 'logs/**', 'sessions/**', '*.backup.*']",
      "credentials: []",
      "instructions: { filename: 'rules', globalPath: '~/.codeium/windsurf/rules' }",
      "mcp: configPath 'mcp_config.json', scope 'user', rootKey 'mcpServers', format 'json', writeMode 'standalone', envSyntax '${env:VAR}', envVarStyle 'inline', commandType 'string', envKey 'env'",
      "transports: stdio → { typeField: 'type', typeValue: 'stdio' }, http → { typeField: 'type', typeValue: 'http', urlKey: 'serverUrl' }",
      "Verify the definition loads correctly: run npx tsc --noEmit && npx vitest run"
    ],
    "passes": true
  },
  {
    "id": "TEST-004",
    "category": "test",
    "priority": 2,
    "description": "Add snapshot tests for Windsurf MCP transformation",
    "steps": [
      "In src/mcp/__tests__/transformer.test.ts, add describe('Windsurf') block",
      "Test stdio server: verify ${env:VAR} syntax, standard transport types, mcpServers root key",
      "Test http server: verify serverUrl key for HTTP URL (not 'url'), standard transport type",
      "Add snapshot test for full Windsurf output",
      "Update schema-loader tests to expect 6 agent definitions (up from 5)",
      "Run npx vitest run — all tests must pass"
    ],
    "passes": true
  },
  {
    "id": "FEAT-010",
    "category": "feature",
    "priority": 3,
    "description": "Add --dry-run flag to all mutating commands (link, unlink, mcp sync)",
    "steps": [
      "Add a --dry-run option to the 'link', 'unlink', and 'mcp sync' commands in src/cli.ts",
      "In src/core/linker.ts: add a dryRun parameter to linkAgent() and unlinkAgent(). When true, compute results without calling symlinkSync, renameSync, unlinkSync, or mkdirSync. Return the same LinkResult[]/UnlinkResult[] arrays so the caller can display what would happen.",
      "In src/commands/link.ts: accept dryRun option, pass to linkAgent(), prefix output with '[dry-run]' when active",
      "In src/commands/unlink.ts: accept dryRun option, pass to unlinkAgent(), prefix output with '[dry-run]'",
      "In src/commands/mcp-sync.ts: accept dryRun option, skip writer calls (writeJSON/mergeJSON/writeTOML) when true, show what files would be written",
      "Run npx tsc --noEmit"
    ],
    "passes": true
  },
  {
    "id": "TEST-005",
    "category": "test",
    "priority": 4,
    "description": "Add tests for --dry-run mode",
    "steps": [
      "In src/core/__tests__/linker.test.ts: add tests verifying linkAgent with dryRun=true returns results but does NOT create symlinks on disk",
      "Add test verifying unlinkAgent with dryRun=true returns results but does NOT remove symlinks or restore backups",
      "In src/__tests__/e2e.test.ts: add test calling linkAgent(agentDef, repoDir, true) then verify no symlinks exist in the config dir",
      "Run npx vitest run — all tests must pass"
    ],
    "passes": true
  },
  {
    "id": "FEAT-011",
    "category": "feature",
    "priority": 5,
    "description": "Add JSON Schema validation for agent definition files",
    "steps": [
      "Create src/schemas/agent-definition.schema.json — a JSON Schema (draft-07) describing the full AgentDefinition structure: required fields (id, name, configDir, detect, portable, ignore, credentials, instructions, mcp), nested object shapes (PlatformPaths, DetectRule, MCPConfig, TransportMap), enums (writeMode, commandType, scope, format, envVarStyle, detect.type)",
      "In src/core/schema-loader.ts: import the JSON schema and use a lightweight validator. Since we want zero new dependencies, implement a simple validateAgainstSchema() function that checks: required fields exist, field types match (string, object, array), enum values are valid. This replaces the current hand-rolled validateAgentDefinition().",
      "The new validation should catch all current checks plus: missing envKey, missing transports, invalid enum values for writeMode/commandType/scope/format/envVarStyle",
      "Add a CLI command 'agentsync validate' in src/cli.ts that loads all agent definitions and reports validation results — useful for contributors testing their agent JSON",
      "Create src/commands/validate.ts implementing the validateCommand()",
      "Run npx tsc --noEmit"
    ],
    "passes": true
  },
  {
    "id": "TEST-006",
    "category": "test",
    "priority": 6,
    "description": "Add tests for JSON Schema validation",
    "steps": [
      "In src/core/__tests__/schema-loader.test.ts: add tests for the new schema validation — missing required fields, invalid enum values, wrong types",
      "Test that all 6 bundled agent definitions pass validation",
      "Test that a definition with writeMode 'invalid' is rejected",
      "Test that a definition missing 'transports' is rejected",
      "Run npx vitest run — all tests must pass"
    ],
    "passes": true
  },
  {
    "id": "FEAT-012",
    "category": "feature",
    "priority": 7,
    "description": "Implement `agentsync export` command to generate a standalone install script",
    "steps": [
      "Create src/commands/export.ts",
      "The command reads the current agentsync.json manifest and mcp.json",
      "Generates a self-contained shell script (install.sh) that: creates the config repo directory structure, writes mcp.json content inline, writes per-agent MCP configs inline (pre-transformed), creates symlinks for portable files",
      "The script should be runnable without agentsync installed — pure bash",
      "Output the script to stdout (user can redirect: agentsync export > install.sh)",
      "Wire up in src/cli.ts as 'agentsync export'",
      "Run npx tsc --noEmit"
    ],
    "passes": true
  },
  {
    "id": "TEST-007",
    "category": "test",
    "priority": 8,
    "description": "Add tests for export command",
    "steps": [
      "Create src/commands/__tests__/export.test.ts",
      "Test that the generated script contains the expected mcp.json content",
      "Test that the script includes mkdir -p calls for agent config dirs",
      "Test that the script includes symlink creation for portable files",
      "Test that the script is valid bash (starts with #!/bin/bash, no syntax errors in template)",
      "Run npx vitest run — all tests must pass"
    ],
    "passes": true
  },
  {
    "id": "RELEASE-002",
    "category": "release",
    "priority": 9,
    "description": "Update README, bump version to 0.3.0, verify package",
    "steps": [
      "Update README.md supported agents table: add Windsurf with config details",
      "Add 'export' and 'validate' to the commands table in README.md",
      "Document --dry-run flag in the commands section",
      "Bump version in package.json and src/version.ts to 0.3.0",
      "Update DEVELOPMENT.md if any new patterns were introduced",
      "Run npx tsc --noEmit",
      "Run npx vitest run — all tests must pass",
      "Run npm pack --dry-run — verify agents/windsurf.json is included"
    ],
    "passes": true
  }
]
```
