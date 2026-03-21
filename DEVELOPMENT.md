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
├── index.ts                   # Public API (re-exports version)
├── schemas/
│   ├── agent-schema.ts        # TypeScript types for agent definitions
│   ├── agent-definition.schema.json  # JSON Schema (draft-07) for validation
│   └── agent-definition-schema-data.ts  # Inlined schema as TS constant (bundle compat)
├── core/
│   ├── detector.ts            # Scan filesystem for installed agents
│   ├── schema-loader.ts       # Load + validate agent JSON definitions from agents/
│   └── linker.ts              # Symlink management (link, unlink, status, backup/restore)
├── mcp/
│   ├── types.ts               # Normalized MCP config types
│   ├── parser.ts              # Parse + validate mcp.json
│   ├── transformer.ts         # Transform normalized config → per-agent format
│   ├── importer.ts            # Reverse-import native agent MCP configs → normalized format
│   └── writer.ts              # Write transformed configs (JSON, TOML, merge strategies)
├── commands/                  # One file per CLI command
│   ├── init.ts                # One-command setup (detect, copy, import MCP, link)
│   ├── link.ts / unlink.ts    # Symlink management
│   ├── push.ts / pull.ts      # Git sync wrappers
│   ├── enable.ts / disable.ts # Toggle agents in manifest
│   ├── mcp-sync.ts / mcp-add.ts / mcp-remove.ts / mcp-list.ts / mcp-diff.ts
│   ├── status.ts / agents.ts / doctor.ts / validate.ts / export.ts
│   └── __tests__/             # Per-command unit tests
├── utils/
│   ├── output.ts              # ANSI-colored CLI output helpers (respects NO_COLOR)
│   ├── paths.ts               # Cross-platform path expansion (~, %APPDATA%)
│   └── manifest.ts            # Load/save/validate agents-anywhere.json manifest
└── __tests__/
    └── e2e.test.ts            # Full workflow integration tests

agents/                        # Declarative agent definitions (shipped with package)
├── claude-code.json
├── codex.json
├── opencode.json
├── gemini-cli.json
├── cursor.json
├── windsurf.json
├── github-copilot.json
├── amazon-q.json
├── kiro.json
└── antigravity.json
```

## Architecture

### Core concept: Agent Definitions

Everything revolves around the JSON files in `agents/`. Each one declares what an agent looks like on disk — where it stores config, what files are portable, and how its MCP format works. **Adding a new agent = adding one JSON file.** No TypeScript code.

### What happens when a user runs `agents-anywhere init`

```
detectAgents() → installed agents
        │
        ▼
promptPrimaryAgent() → user selects primary
        │
        ▼
copyPortableFiles() → copies configs from each agent's configDir to repo
        │
        ▼
syncInstructions() → primary's instructions = source of truth
        │             other agents get symlinks (AGENTS.md → CLAUDE.md)
        ▼
importMCPServers() → reads native MCP configs from all agents
        │             reverse-transforms to normalized format
        │             merges duplicates (keeps richer config)
        ▼
linkAllAgents() → creates symlinks (repo → configDir)
        │
        ▼
syncMCPToAllAgents() → writes per-agent MCP configs
        │
        ▼
git commit + optional GitHub repo creation
```

### What happens when a user runs `agents-anywhere link`

```
agents/*.json → schema-loader → AgentDefinition[]
                                        │
agents-anywhere.json → manifest.ts → enabled agents
                                        │
                                        ▼
                            linker.ts (for each agent)
                                        │
                         ┌──────────────┼──────────────┐
                         ▼              ▼              ▼
                    backup existing   create symlinks   report status
                    files if needed   (repo → configDir)
```

The linker reads the `portable` array from each agent definition and creates symlinks from the config repo to the agent's config directory. `commands/**` becomes a symlink at `~/.claude/commands` → `~/agents-anywhere-config/claude-code/commands`.

### MCP: forward transform and reverse import

**Forward (mcp sync):** `mcp.json` (normalized) → `transformer.ts` → per-agent native format → `writer.ts`

**Reverse (init import):** per-agent native config → `importer.ts` → normalized format → `mcp.json`

The importer reads each agent's native MCP config, detects transport types, reverses env var syntax (`${VAR}` → `{ $env: "VAR" }`), and handles special cases like Codex's named env style and bearer token extraction.

### Key Design Decisions

**Declarative agent definitions.** The schema (`agent-schema.ts`) defines the contract. The linker, transformer, and writer are fully generic — they read the definition and do the right thing.

**Symlink-based linking.** Portable files are symlinked, not copied. Changes in either location reflect in both. Existing files are backed up before linking.

**Instruction syncing.** The primary agent's instructions file is the source of truth. Other agents get symlinks with the correct filename for each tool. Agents without global instruction support (`globalSupport: false`) are warned but not synced.

**Three MCP write strategies.** Selected by the agent definition's `writeMode` and `format`:

| Strategy | When | Behavior |
|---|---|---|
| `writeJSON` | `writeMode: "standalone"`, `format: "json"` | Overwrites file with `{ [rootKey]: servers }` |
| `mergeJSON` | `writeMode: "merge"`, `format: "json"` | Preserves non-MCP keys in existing file |
| `writeTOML` | `format: "toml"` | Merges `[rootKey]` section into existing TOML |

**Dry-run mode.** `link`, `unlink`, and `mcp sync` accept `--dry-run` to preview changes without writing to disk.

## Adding a New Agent

1. Create `agents/<agent-id>.json`:

```jsonc
{
  "id": "my-agent",
  "name": "My Agent",
  "configDir": {
    "darwin": "~/.my-agent",
    "linux": "~/.my-agent",
    "win32": "%APPDATA%/my-agent"
  },
  "detect": {
    "type": "directory-exists",     // how to check if installed
    "path": "~/.my-agent"
  },
  "portable": [                     // files to symlink across devices
    "AGENTS.md",
    "skills/**",
    "config.json"
  ],
  "ignore": ["cache/**", "sessions/**"],
  "credentials": ["~/.my-agent/auth.json"],
  "instructions": {
    "filename": "AGENTS.md",
    "globalPath": "~/.my-agent/AGENTS.md",
    "globalSupport": true           // false for agents without global instructions
  },
  "mcp": {
    "configPath": "mcp.json",
    "scope": "user",
    "rootKey": "mcpServers",
    "format": "json",
    "writeMode": "standalone",
    "envSyntax": "${VAR}",
    "transports": {
      "stdio": { "typeField": "type", "typeValue": "stdio" },
      "http": { "typeField": "type", "typeValue": "http" }
    },
    "commandType": "string",
    "envKey": "env",
    "envVarStyle": "inline"
  }
}
```

2. Run `npm test` — schema-loader tests auto-validate the new definition.

3. Add MCP transformer snapshot tests:

```ts
describe("My Agent", () => {
  it("transforms stdio server correctly", async () => {
    const agent = await loadAgentById("my-agent");
    const result = transformForAgent(sampleConfig, agent!);
    expect(result).toMatchSnapshot();
  });
});
```

4. `npx vitest run --update` to generate snapshots.
5. `npm run build && npx agents-anywhere agents` to verify.

### Agent Definition Field Reference

**Core fields** — what files to sync:
- `portable` — glob patterns of files/dirs to symlink (e.g. `"skills/**"`, `"CLAUDE.md"`)
- `ignore` — files to never sync (sessions, cache, etc.)
- `credentials` — files to warn about if found in the repo
- `instructions` — the agent's instructions file (`CLAUDE.md`, `AGENTS.md`, etc.)
  - `instructions.globalSupport` — `true` if the agent reads global (user-level) instructions, `false` for project-only agents (Cursor, Windsurf, Amazon Q)

**MCP fields** — how to generate MCP configs:
- `configPath` — path relative to configDir
- `rootKey` — top-level JSON/TOML key wrapping servers
- `envSyntax` — template for env var references (`${VAR}`, `{env:VAR}`, etc.)
- `envVarStyle` — `"inline"` (template substitution) or `"named"` (array of var names)
- `commandType` — `"string"` (separate command + args) or `"array"` (combined)
- `writeMode` — `"standalone"` (overwrite) or `"merge"` (preserve other keys)
- `transports` — per-transport type field/value mapping

Optional: `serverSection` (TOML section key for diff), `defaultSyntax` (fallback env syntax).

## Testing

```bash
npm test                          # all tests
npx vitest run src/core/          # specific directory
npx vitest run -t "Claude Code"   # pattern match
```

### Test Organization

| File | What it tests |
|---|---|
| `core/__tests__/detector.test.ts` | Agent filesystem detection |
| `core/__tests__/linker.test.ts` | Symlink creation, backup, restore, status |
| `core/__tests__/schema-loader.test.ts` | Agent JSON loading and validation |
| `mcp/__tests__/transformer.test.ts` | Per-agent MCP transformation + snapshots |
| `mcp/__tests__/importer.test.ts` | MCP reverse import + round-trip tests |
| `mcp/__tests__/writer.test.ts` | JSON/TOML file writing and merging |
| `commands/__tests__/doctor.test.ts` | Health check diagnostics |
| `commands/__tests__/mcp-diff.test.ts` | Diff computation |
| `commands/__tests__/export.test.ts` | Export script generation |
| `commands/__tests__/validate.test.ts` | Agent definition schema validation |
| `commands/__tests__/init.test.ts` | Init command and `--from` clone flow |
| `commands/__tests__/mcp-add.test.ts` | Non-interactive `mcp add` flag parsing |
| `commands/__tests__/mcp-remove.test.ts` | MCP server removal |
| `commands/__tests__/status.test.ts` | Status display and link reporting |
| `commands/__tests__/agents.test.ts` | Agent listing with install/link badges |
| `commands/__tests__/mcp-list.test.ts` | MCP server listing |
| `commands/__tests__/enable-disable.test.ts` | Agent enable/disable |
| `commands/__tests__/push.test.ts` | Push command |
| `commands/__tests__/pull.test.ts` | Pull command |
| `utils/__tests__/output.test.ts` | NO_COLOR, FORCE_COLOR, TTY detection |
| `utils/__tests__/manifest.test.ts` | Manifest validation and save |
| `utils/__tests__/paths.test.ts` | Platform path fallback |
| `__tests__/e2e.test.ts` | Full workflow (init → link → mcp sync → unlink) |

### Testing Conventions

- Temp directories in `os.tmpdir()`, never inside source tree
- Mock `os.homedir()` to isolate from real home directory
- Mock `process.cwd()` when testing commands that call `loadManifest()`
- Agent definitions loaded from real `agents/` directory (no mocking)

## Build

tsup builds CJS and ESM bundles:

```bash
npm run build    # tsup + copies agents/ to dist/agents/
```

- CJS: `dist/cli.js` (bin entry point, with shebang)
- ESM: `dist/index.mjs` (public API, no shebang)
- Agent definitions copied to `dist/agents/`, located at runtime via `__dirname`
- JSON Schema inlined as TS constant for bundle compatibility

**Shared utilities.** `getAgentsDir()` is exported from `schema-loader.ts` and reused by `validate.ts`. Do not duplicate.

## Common Patterns

**Loading agents** — `loadAgentById()` or `loadAllAgentDefinitions()`. Cached after first call.

**Path expansion** — `expandPath(getPlatformPath(def.configDir))` for resolved platform path.

**Manifest loading** — `loadManifest()` searches `process.cwd()` then `~/agents-anywhere-config` for `agents-anywhere.json`. Returns `null` if not found. `repoDir` derived from file location (not JSON content) to prevent path traversal. `saveManifest()` writes back to disk.

**Writer selection** — `mcp-sync.ts` routes based on `format` and `writeMode`:
```
format === "toml"     → writeTOML(path, rootKey, servers)
writeMode === "merge" → mergeJSON(path, rootKey, servers)
else                  → writeJSON(path, rootKey, servers)
```
