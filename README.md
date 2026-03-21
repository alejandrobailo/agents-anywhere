# agents-anywhere

> Manage your AI coding agent configs in one place. One MCP config for every tool. Sync between devices with git.

Developers using multiple AI coding agents (Claude Code, Codex CLI, Cursor, Gemini CLI, etc.) maintain separate configs in separate locations with separate formats. The worst offender: **MCP server configuration** — different root keys, different env var syntaxes, different transport naming. Adding one MCP server means editing N files in N formats.

**agents-anywhere** fixes this. Write one canonical `mcp.json`, run `agents-anywhere mcp sync`, and every agent gets its native config generated automatically.

## Quick Start

```bash
npx agents-anywhere init
npx agents-anywhere link
npx agents-anywhere mcp sync
```

Already have a config repo? Clone it on a new device:

```bash
npx agents-anywhere init --from https://github.com/you/agents-anywhere-config.git
npx agents-anywhere link
npx agents-anywhere mcp sync
```

## Features

### Agent Detection & Linking

```bash
$ agents-anywhere init

Detected 10 AI coding agents:
  Claude Code    ~/.claude
  Codex CLI      ~/.codex
  OpenCode       ~/.config/opencode
  Gemini CLI     ~/.gemini
  Cursor         ~/.cursor
  Windsurf       ~/.codeium/windsurf
  GitHub Copilot ~/.copilot
  Amazon Q       ~/.aws/amazonq
  Kiro           ~/.kiro
  Antigravity    ~/.gemini/antigravity

Created config repo at ~/agents-anywhere-config
Run `agents-anywhere link` to connect your agents.

$ agents-anywhere link

[OK] Claude Code    — settings.json, CLAUDE.md, commands/, skills/ linked
[OK] Codex CLI     — config.toml, AGENTS.md, skills/ linked
[OK] OpenCode      — opencode.json, AGENTS.md, skills/ linked
[OK] Gemini CLI    — settings.json, GEMINI.md, skills/, commands/ linked
[OK] Cursor        — rules/, skills/ linked
[OK] Windsurf      — mcp_config.json, memories/, rules/, skills/ linked
[OK] GitHub Copilot — copilot-instructions.md, skills/ linked
[OK] Amazon Q      — rules/, skills/ linked
[OK] Kiro          — steering/, skills/ linked
[OK] Antigravity   — GEMINI.md, skills/ linked
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

**agents-anywhere generates the right format for each agent:**

| Agent | Output | Root key | Env syntax |
|---|---|---|---|
| Claude Code | `~/.claude/.mcp.json` | `mcpServers` | `${VAR}` |
| Codex CLI | `~/.codex/config.toml` (merged) | `[mcp_servers.*]` | `env_vars` array |
| OpenCode | `~/.config/opencode/opencode.json` (merged) | `mcp` | `{env:VAR}` |
| Gemini CLI | `~/.gemini/settings.json` (merged) | `mcpServers` | `${VAR}` |
| Cursor | `~/.cursor/mcp.json` | `mcpServers` | `${env:VAR}` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` | `${env:VAR}` |
| GitHub Copilot | `~/.copilot/mcp-config.json` | `mcpServers` | `${VAR}` |
| Amazon Q | `~/.aws/amazonq/mcp.json` | `mcpServers` | `${VAR}` |
| Kiro | `~/.kiro/settings/mcp.json` | `mcpServers` | `${VAR}` |
| Antigravity | `~/.gemini/antigravity/mcp_config.json` | `mcpServers` | `${VAR}` |

```bash
$ agents-anywhere mcp sync

[OK] Claude Code — 2 servers written to ~/.claude/.mcp.json
[OK] Codex CLI   — 2 servers merged into ~/.codex/config.toml
[OK] OpenCode    — 2 servers merged into ~/.config/opencode/opencode.json
[OK] Gemini CLI  — 2 servers merged into ~/.gemini/settings.json
[OK] Cursor      — 2 servers written to ~/.cursor/mcp.json
[OK] Windsurf    — 2 servers written to ~/.codeium/windsurf/mcp_config.json
[OK] GitHub Copilot — 2 servers written to ~/.copilot/mcp-config.json
[OK] Amazon Q    — 2 servers written to ~/.aws/amazonq/mcp.json
[OK] Kiro        — 2 servers written to ~/.kiro/settings/mcp.json
[OK] Antigravity — 2 servers written to ~/.gemini/antigravity/mcp_config.json
```

### Non-interactive MCP Server Addition

Add MCP servers from scripts or CI without interactive prompts:

```bash
# Add a stdio server
agents-anywhere mcp add github \
  --transport stdio \
  --command npx \
  --args "-y,@modelcontextprotocol/server-github" \
  --env GITHUB_TOKEN=GITHUB_TOKEN

# Add an HTTP server
agents-anywhere mcp add sentry \
  --transport http \
  --url https://mcp.sentry.dev/sse
```

### Device Sync

Not a feature we build — it's just git.

```bash
# Device A
cd ~/agents-anywhere-config && git add -A && git commit -m "add sentry MCP" && git push

# Device B
cd ~/agents-anywhere-config && git pull
# Post-merge hook runs `agents-anywhere link && agents-anywhere mcp sync` automatically
```

The `init` command sets up a git `post-merge` hook so `git pull` automatically re-links and regenerates MCP configs.

## Commands

| Command | Description |
|---|---|
| `agents-anywhere init [dir]` | Detect agents, create config repo, scaffold structure |
| `agents-anywhere init --from <url>` | Clone an existing config repo from a git URL |
| `agents-anywhere link [agent]` | Create symlinks for all or a specific agent |
| `agents-anywhere unlink [agent]` | Remove symlinks, restore backups |
| `agents-anywhere status` | Show link status for each agent and file |
| `agents-anywhere agents` | List all known agents with install status |
| `agents-anywhere mcp sync` | Generate per-agent MCP configs from `mcp.json` |
| `agents-anywhere mcp add <name>` | Add an MCP server to `mcp.json` (interactive or with flags) |
| `agents-anywhere mcp list` | Show all configured MCP servers |
| `agents-anywhere mcp diff` | Preview what `mcp sync` would change |
| `agents-anywhere validate` | Validate all bundled agent definition JSON files against the schema |
| `agents-anywhere export` | Generate a standalone install script (pure bash, no agents-anywhere needed) |
| `agents-anywhere doctor` | Diagnose config health: broken symlinks, credentials in repo, stale configs |

The `link`, `unlink`, and `mcp sync` commands support a `--dry-run` flag to preview changes without writing to disk.

## Supported Agents

| Agent | Config dir | MCP config | Instructions | Skills | Portable |
|---|---|---|---|---|---|
| Claude Code | `~/.claude` | `.mcp.json` | `CLAUDE.md` | `skills/` | settings, commands, skills |
| Codex CLI | `~/.codex` | `config.toml` | `AGENTS.md` | `skills/` | config, instructions, skills |
| OpenCode | `~/.config/opencode` | `opencode.json` | `AGENTS.md` | `skills/` | config, instructions, skills |
| Gemini CLI | `~/.gemini` | `settings.json` | `GEMINI.md` | `skills/` | settings, instructions, skills, commands |
| Cursor | `~/.cursor` | `mcp.json` | `rules/` | `skills/` | rules, skills |
| Windsurf | `~/.codeium/windsurf` | `mcp_config.json` | `rules/` | `skills/` | config, memories, rules, skills |
| GitHub Copilot | `~/.copilot` | `mcp-config.json` | `copilot-instructions.md` | `skills/` | instructions, skills |
| Amazon Q | `~/.aws/amazonq` | `mcp.json` | `rules/` | `skills/` | rules, skills |
| Kiro | `~/.kiro` | `settings/mcp.json` | `steering/` | `skills/` | steering, skills |
| Antigravity | `~/.gemini/antigravity` | `mcp_config.json` | `GEMINI.md` | `skills/` | instructions, skills |

### Planned

Cline, Roo Code, Kilo Code, Amp, Augment, Zed, and more.

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
    +-- copilot adapter     --> ~/.copilot/mcp-config.json
    +-- amazon-q adapter    --> ~/.aws/amazonq/mcp.json
    +-- kiro adapter        --> ~/.kiro/settings/mcp.json
    +-- antigravity adapter --> ~/.gemini/antigravity/mcp_config.json
```

### Repo structure (what you manage)

```
agents-anywhere-config/
+-- agents-anywhere.json          # Manifest: which agents, repo metadata
+-- mcp.json                # Normalized MCP config (the one you edit)
+-- claude-code/
|   +-- settings.json       # → ~/.claude/settings.json
|   +-- CLAUDE.md           # → ~/.claude/CLAUDE.md
|   +-- commands/           # → ~/.claude/commands/
|   +-- skills/             # → ~/.claude/skills/
+-- codex/
|   +-- config.toml         # → ~/.codex/config.toml
|   +-- AGENTS.md           # → ~/.codex/AGENTS.md
|   +-- skills/             # → ~/.codex/skills/
+-- opencode/
|   +-- opencode.json       # → ~/.config/opencode/opencode.json
|   +-- AGENTS.md           # → ~/.config/opencode/AGENTS.md
|   +-- skills/             # → ~/.config/opencode/skills/
+-- github-copilot/
|   +-- copilot-instructions.md  # → ~/.copilot/copilot-instructions.md
|   +-- skills/             # → ~/.copilot/skills/
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
