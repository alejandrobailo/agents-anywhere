# agentsync

> Manage your AI coding agent configs in one place. One MCP config for every tool. Sync between devices with git.

Developers using multiple AI coding agents (Claude Code, Codex CLI, Cursor, Gemini CLI, etc.) maintain separate configs in separate locations with separate formats. The worst offender: **MCP server configuration** — different root keys, different env var syntaxes, different transport naming. Adding one MCP server means editing N files in N formats.

**agentsync** fixes this. Write one canonical `mcp.json`, run `agentsync mcp sync`, and every agent gets its native config generated automatically.

## Quick Start

```bash
npx agentsync init
npx agentsync link
npx agentsync mcp sync
```

Already have a config repo? Clone it on a new device:

```bash
npx agentsync init --from https://github.com/you/agentsync-config.git
npx agentsync link
npx agentsync mcp sync
```

## Features

### Agent Detection & Linking

```bash
$ agentsync init

Detected 6 AI coding agents:
  Claude Code    ~/.claude
  Codex CLI      ~/.codex
  OpenCode       ~/.config/opencode
  Gemini CLI     ~/.gemini
  Cursor         ~/.cursor
  Windsurf       ~/.codeium/windsurf

Created config repo at ~/agentsync-config
Run `agentsync link` to connect your agents.

$ agentsync link

[OK] Claude Code — settings.json, CLAUDE.md, commands/, skills/ linked
[OK] Codex CLI   — config.toml, AGENTS.md, skills/ linked
[OK] OpenCode    — opencode.json, AGENTS.md linked
[OK] Gemini CLI  — settings.json, GEMINI.md linked
[OK] Cursor      — rules/ linked
[OK] Windsurf    — mcp_config.json, memories/, rules/ linked
```

- Scans for installed agents by checking known config directories
- Creates symlinks from each agent's config dir to the central repo
- Only links portable files — ignores sessions, history, credentials
- Backs up existing files before linking (`.backup.{timestamp}`)

### MCP Normalization

One canonical config generates tool-specific configs automatically.

**You write one file (`mcp.json`):**

```json
{
  "servers": {
    "github": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": { "$env": "GITHUB_TOKEN" }
      }
    },
    "sentry": {
      "transport": "http",
      "url": "https://mcp.sentry.dev/sse",
      "headers": {
        "Authorization": { "$env": "SENTRY_TOKEN", "prefix": "Bearer " }
      }
    }
  }
}
```

**agentsync generates the right format for each agent:**

| Agent | Output | Root key | Env syntax |
|---|---|---|---|
| Claude Code | `~/.claude/.mcp.json` | `mcpServers` | `${VAR}` |
| Codex CLI | `~/.codex/config.toml` (merged) | `[mcp_servers.*]` | `env_vars` array |
| OpenCode | `~/.config/opencode/opencode.json` (merged) | `mcp` | `{env:VAR}` |
| Gemini CLI | `~/.gemini/settings.json` (merged) | `mcpServers` | `${VAR}` |
| Cursor | `~/.cursor/mcp.json` | `mcpServers` | `${env:VAR}` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` | `${env:VAR}` |

```bash
$ agentsync mcp sync

[OK] Claude Code — 2 servers written to ~/.claude/.mcp.json
[OK] Codex CLI   — 2 servers merged into ~/.codex/config.toml
[OK] OpenCode    — 2 servers merged into ~/.config/opencode/opencode.json
[OK] Gemini CLI  — 2 servers merged into ~/.gemini/settings.json
[OK] Cursor      — 2 servers written to ~/.cursor/mcp.json
[OK] Windsurf    — 2 servers written to ~/.codeium/windsurf/mcp_config.json
```

### Non-interactive MCP Server Addition

Add MCP servers from scripts or CI without interactive prompts:

```bash
# Add a stdio server
agentsync mcp add github \
  --transport stdio \
  --command npx \
  --args "-y,@modelcontextprotocol/server-github" \
  --env GITHUB_TOKEN=GITHUB_TOKEN

# Add an HTTP server
agentsync mcp add sentry \
  --transport http \
  --url https://mcp.sentry.dev/sse
```

### Device Sync

Not a feature we build — it's just git.

```bash
# Device A
cd ~/agentsync-config && git add -A && git commit -m "add sentry MCP" && git push

# Device B
cd ~/agentsync-config && git pull
# Post-merge hook runs `agentsync link && agentsync mcp sync` automatically
```

The `init` command sets up a git `post-merge` hook so `git pull` automatically re-links and regenerates MCP configs.

## Commands

| Command | Description |
|---|---|
| `agentsync init [dir]` | Detect agents, create config repo, scaffold structure |
| `agentsync init --from <url>` | Clone an existing config repo from a git URL |
| `agentsync link [agent]` | Create symlinks for all or a specific agent |
| `agentsync unlink [agent]` | Remove symlinks, restore backups |
| `agentsync status` | Show link status for each agent and file |
| `agentsync agents` | List all known agents with install status |
| `agentsync mcp sync` | Generate per-agent MCP configs from `mcp.json` |
| `agentsync mcp add <name>` | Add an MCP server to `mcp.json` (interactive or with flags) |
| `agentsync mcp list` | Show all configured MCP servers |
| `agentsync mcp diff` | Preview what `mcp sync` would change |
| `agentsync validate` | Validate all bundled agent definition JSON files against the schema |
| `agentsync export` | Generate a standalone install script (pure bash, no agentsync needed) |
| `agentsync doctor` | Diagnose config health: broken symlinks, credentials in repo, stale configs |

The `link`, `unlink`, and `mcp sync` commands support a `--dry-run` flag to preview changes without writing to disk.

## Supported Agents

| Agent | Config dir | Config format | MCP config | Instructions file |
|---|---|---|---|---|
| Claude Code | `~/.claude` | JSON | `.mcp.json` | `CLAUDE.md` |
| Codex CLI | `~/.codex` | TOML | `config.toml` | `AGENTS.md` |
| OpenCode | `~/.config/opencode` | JSON | `opencode.json` (merged) | `AGENTS.md` |
| Gemini CLI | `~/.gemini` | JSON | `settings.json` (merged) | `GEMINI.md` |
| Cursor | `~/.cursor` | JSON | `mcp.json` | `rules/**` |
| Windsurf | `~/.codeium/windsurf` | JSON | `mcp_config.json` | `rules/**` |

### Planned

Amp, Cline, Roo Code, and more.

## How It Works

Agent support is fully declarative — each agent is defined by a JSON schema file. No TypeScript code needed to add a new agent.

```
mcp.json (normalized)
    |
    +-- claude-code adapter --> ~/.claude/.mcp.json
    +-- codex adapter       --> merges into ~/.codex/config.toml
    +-- opencode adapter    --> merges into ~/.config/opencode/opencode.json
    +-- gemini adapter      --> merges into ~/.gemini/settings.json
    +-- cursor adapter      --> ~/.cursor/mcp.json
    +-- windsurf adapter    --> ~/.codeium/windsurf/mcp_config.json
```

### Repo structure (what you manage)

```
agentsync-config/
+-- agentsync.json          # Manifest: which agents, repo metadata
+-- mcp.json                # Normalized MCP config (the one you edit)
+-- claude-code/
|   +-- settings.json       # Symlinked to ~/.claude/settings.json
|   +-- CLAUDE.md           # Symlinked to ~/.claude/CLAUDE.md
|   +-- commands/           # Symlinked to ~/.claude/commands/
+-- codex/
|   +-- config.toml         # Symlinked to ~/.codex/config.toml
|   +-- AGENTS.md           # Symlinked to ~/.codex/AGENTS.md
+-- .gitignore
```

## Contributing Agent Definitions

To add support for a new agent, create a JSON file in `agents/`:

```json
{
  "id": "my-agent",
  "name": "My Agent",
  "configDir": {
    "darwin": "~/.my-agent",
    "linux": "~/.my-agent",
    "win32": "%APPDATA%/my-agent"
  },
  "detect": {
    "type": "directory-exists",
    "path": "~/.my-agent"
  },
  "portable": ["config.json", "rules/**"],
  "ignore": ["cache/**", "sessions/**"],
  "credentials": [],
  "instructions": {
    "filename": "INSTRUCTIONS.md",
    "globalPath": "~/.my-agent/INSTRUCTIONS.md"
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

## License

MIT
