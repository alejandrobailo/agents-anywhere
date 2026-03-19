# Development Guide

## Setup

```bash
git clone <repo-url> && cd agents-anywhere
npm install
npm run build        # tsup → dist/
npm test             # vitest
npm run lint         # tsc --noEmit
```

## Project Structure

```
src/
├── cli.ts                     # Entry point — Commander program definition
├── version.ts                 # Single source of truth for package version
├── index.ts                   # Public API (currently just re-exports version)
├── schemas/
│   └── agent-schema.ts        # TypeScript types for agent definition JSON files
├── core/
│   ├── detector.ts            # Filesystem detection of installed agents
│   ├── schema-loader.ts       # Load + validate agent JSON definitions from agents/
│   └── linker.ts              # Symlink management (link, unlink, status, backup/restore)
├── mcp/
│   ├── types.ts               # Normalized MCP config types (what users write in mcp.json)
│   ├── parser.ts              # Parse + validate mcp.json
│   ├── transformer.ts         # Transform normalized config → per-agent format
│   └── writer.ts              # Write transformed configs (JSON, TOML, merge strategies)
├── commands/
│   ├── init.ts                # `agentsync init` — scaffold config repo
│   ├── link.ts                # `agentsync link` — create symlinks
│   ├── unlink.ts              # `agentsync unlink` — remove symlinks, restore backups
│   ├── status.ts              # `agentsync status` — show link status
│   ├── agents.ts              # `agentsync agents` — list known agents
│   ├── mcp-sync.ts            # `agentsync mcp sync` — generate per-agent MCP configs
│   ├── mcp-add.ts             # `agentsync mcp add` — interactive server addition
│   ├── mcp-list.ts            # `agentsync mcp list` — list configured servers
│   ├── mcp-diff.ts            # `agentsync mcp diff` — preview sync changes
│   └── doctor.ts              # `agentsync doctor` — config health diagnostics
├── utils/
│   ├── output.ts              # ANSI-colored CLI output helpers
│   ├── paths.ts               # Cross-platform path expansion (~, %APPDATA%)
│   └── manifest.ts            # Load agentsync.json manifest
└── __tests__/
    └── e2e.test.ts            # Full init → link → mcp sync → unlink integration tests

agents/                        # Declarative agent definitions (JSON, shipped with package)
├── claude-code.json
├── codex.json
├── cursor.json
├── gemini-cli.json
└── opencode.json
```

## Architecture

### Data Flow

```
agents/*.json          User's mcp.json
   │                       │
   ▼                       ▼
schema-loader          parser.ts
   │                       │
   ▼                       ▼
AgentDefinition     NormalizedMCPConfig
        \                /
         \              /
          ▼            ▼
        transformer.ts
              │
              ▼
        TransformResult { rootKey, servers, format }
              │
              ▼
          writer.ts
              │
     ┌────────┼────────┐
     ▼        ▼        ▼
  writeJSON  mergeJSON  writeTOML
```

### Key Design Decisions

**Declarative agent definitions.** Adding support for a new agent requires only a JSON file in `agents/` — no TypeScript code. The schema (`agent-schema.ts`) defines the contract. The transformer and writer are fully generic.

**Normalized MCP format.** Users write one `mcp.json` using `{ "$env": "VAR_NAME" }` references. The transformer resolves these to each agent's native syntax (`${VAR}`, `{env:VAR}`, named arrays, etc.).

**Three write strategies.** The writer module has three output modes, selected by the agent definition's `writeMode` and `format` fields:

| Strategy | When | Behavior |
|---|---|---|
| `writeJSON` | `writeMode: "standalone"`, `format: "json"` | Overwrites entire file with `{ [rootKey]: servers }` |
| `mergeJSON` | `writeMode: "merge"`, `format: "json"` | Preserves non-MCP keys in existing JSON file |
| `writeTOML` | `format: "toml"` | Merges `[rootKey]` section into existing TOML file |

**Symlink-based linking.** Portable config files are symlinked from the agent's config dir to the central repo. This means changes in either location are reflected in both. Existing files are backed up before linking.

## Agent Definition Schema

Each agent definition JSON must include these fields:

```jsonc
{
  "id": "my-agent",                    // Unique identifier, used as directory name
  "name": "My Agent",                  // Display name
  "configDir": {                       // Per-platform config directory
    "darwin": "~/.my-agent",
    "linux": "~/.my-agent",
    "win32": "%APPDATA%/my-agent"
  },
  "detect": {                          // How to check if the agent is installed
    "type": "directory-exists",
    "path": "~/.my-agent"
  },
  "portable": ["config.json", "rules/**"],  // Files to symlink
  "ignore": ["cache/**", "sessions/**"],    // Files to never sync
  "credentials": ["~/.my-agent/auth.json"], // Files to warn about if found in repo
  "instructions": {
    "filename": "AGENTS.md",
    "globalPath": "~/.my-agent/AGENTS.md"
  },
  "mcp": {
    "configPath": "mcp.json",          // Path relative to configDir
    "scope": "user",                   // "user", "project", or "project-and-user"
    "rootKey": "mcpServers",           // Top-level key wrapping server entries
    "format": "json",                  // "json" or "toml"
    "writeMode": "standalone",         // "standalone" (overwrite) or "merge" (preserve other keys)
    "envSyntax": "${VAR}",             // Template — VAR is replaced with the env var name
    "transports": {                    // Per-transport configuration
      "stdio": { "typeField": "type", "typeValue": "stdio" },
      "http": { "typeField": "type", "typeValue": "http" }
    },
    "commandType": "string",           // "string" (separate command + args) or "array" (combined)
    "envKey": "env",                   // Key name for environment variables object
    "envVarStyle": "inline"            // "inline" (env syntax template) or "named" (array of var names)
  }
}
```

**Optional MCP fields:**

- `serverSection` — TOML section key for reading existing servers (defaults to `rootKey`). Used by `mcp diff`.
- `defaultSyntax` — Fallback env syntax if not specified.

**Validation.** `schema-loader.ts` validates that `configPath`, `rootKey`, `envSyntax`, `writeMode`, and `commandType` are present. Missing fields cause a startup error.

**envSyntax and envVarStyle.** These work together:

- `envVarStyle: "inline"` — the `envSyntax` template (e.g. `${VAR}`) is used to wrap each env var reference inline.
- `envVarStyle: "named"` — env vars are emitted as an array of names under `envKey` (e.g. Codex's `env_vars: ["GITHUB_TOKEN"]`). The `envSyntax` is not used for inline substitution in this mode.

## MCP Transformation Pipeline

The transformer (`transformer.ts`) converts normalized server entries into agent-specific format:

1. **Transport type** — Sets the transport type field/value per the agent's `transports` config. If `typeField` is omitted, no type field is emitted (agent infers transport implicitly).

2. **Command format** — `commandType: "string"` keeps `command` and `args` separate. `commandType: "array"` combines them into a single `command: [cmd, ...args]` array.

3. **Env vars** — Two paths based on `envVarStyle`:
   - `"inline"`: Each env ref is resolved via `envSyntax.replace("VAR", refName)`, producing strings like `${GITHUB_TOKEN}`.
   - `"named"`: Env var names are collected into an array. Bearer tokens in headers are extracted to `bearer_token_env_var`.

4. **URL key** — HTTP transport uses `transports.http.urlKey` (defaults to `"url"`, but Gemini uses `"httpUrl"`).

## Testing

```bash
npm test                          # Run all tests
npx vitest run src/mcp/           # Run tests in a specific directory
npx vitest run -t "Claude Code"   # Run tests matching a pattern
```

### Test Organization

| File | What it tests |
|---|---|
| `core/__tests__/detector.test.ts` | Agent filesystem detection |
| `core/__tests__/linker.test.ts` | Symlink creation, backup, restore, status |
| `core/__tests__/schema-loader.test.ts` | Agent JSON loading and validation |
| `mcp/__tests__/transformer.test.ts` | Per-agent MCP transformation + snapshots |
| `mcp/__tests__/writer.test.ts` | JSON/TOML file writing and merging |
| `commands/__tests__/doctor.test.ts` | Health check diagnostics |
| `commands/__tests__/mcp-diff.test.ts` | Diff computation |
| `__tests__/e2e.test.ts` | Full workflow integration (init → link → mcp sync → unlink) |

Transformer tests include **snapshots** for each agent's output. After changing transformation logic, update snapshots with:

```bash
npx vitest run --update
```

### Testing Conventions

- Temp directories go in `os.tmpdir()`, never inside the source tree.
- Mock `os.homedir()` to isolate filesystem tests from the real home directory.
- Mock `process.cwd()` when testing commands that call `loadManifest()`.
- All agent definitions are loaded from the real `agents/` directory (no mocking).

## Build

tsup builds both CJS and ESM bundles:

```bash
npm run build    # tsup + copies agents/ to dist/agents/
```

- CJS entry: `dist/cli.js` (used by the `agentsync` bin command)
- ESM entry: `dist/index.mjs` (public API — currently only exports `version`)
- Agent definitions are copied to `dist/agents/` and located at runtime via `__dirname`

The shebang (`#!/usr/bin/env node`) is added by tsup's `banner` config to both builds. When running `dist/cli.js` directly with `node`, strip the first line or use `npx agentsync`.

## Adding a New Agent

1. Create `agents/<agent-id>.json` following the schema above.
2. Run `npm test` — the schema-loader tests will validate the new definition automatically.
3. Add transformer snapshot tests in `mcp/__tests__/transformer.test.ts`:

```ts
describe("My Agent", () => {
  it("transforms stdio server correctly", async () => {
    const agent = await loadAgentById("my-agent");
    const result = transformForAgent(sampleConfig, agent!);
    expect(result).toMatchSnapshot();
  });
});
```

4. Run `npx vitest run --update` to generate the initial snapshot.
5. Test manually: `npm run build && npx agentsync agents` should show the new agent.

## Common Patterns

**Loading agent definitions** — Always use `loadAgentById()` or `loadAllAgentDefinitions()`. Results are cached after the first call.

**Path expansion** — Use `expandPath(getPlatformPath(def.configDir))` to get the resolved config directory for the current platform.

**Manifest loading** — `loadManifest()` searches `process.cwd()` then `~/agentsync-config` for `agentsync.json`. Returns `null` with an error message if not found. The `repoDir` is always derived from the manifest file's location (not from the JSON content) to prevent path traversal.

**Writer selection** — `mcp-sync.ts` routes to the correct writer based on `format` and `writeMode`:

```
format === "toml"          → writeTOML(path, rootKey, servers)
writeMode === "merge"      → mergeJSON(path, rootKey, servers)
else                       → writeJSON(path, rootKey, servers)
```
