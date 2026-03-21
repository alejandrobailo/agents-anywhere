# agents-anywhere

> Your AI agent configs, skills, and instructions — on every device.

You've spent hours perfecting your `CLAUDE.md`, building custom skills, tuning your settings. Then you open your laptop and none of it is there. Or you switch from Claude Code to Codex and start from scratch.

**agents-anywhere** keeps your agent setup in a git repo and symlinks it to every agent on every machine.

## Quick Start

```bash
# New setup — one command does everything
npx agents-anywhere init

# New device (already have a config repo)
npx agents-anywhere init --from https://github.com/you/agents-anywhere-config.git
```

`init` detects your installed agents, picks a primary agent, copies your configs, imports MCP servers, creates symlinks, and optionally pushes to a private GitHub repo. One command, fully configured.

## What gets synced

```
agents-anywhere-config/           # this is your git repo
+-- claude-code/
|   +-- CLAUDE.md                 # → ~/.claude/CLAUDE.md (source of truth)
|   +-- settings.json             # → ~/.claude/settings.json
|   +-- skills/                   # → ~/.claude/skills/
|   +-- commands/                 # → ~/.claude/commands/
+-- codex/
|   +-- AGENTS.md                 # → symlink to claude-code/CLAUDE.md
|   +-- config.toml               # → ~/.codex/config.toml
|   +-- skills/                   # → ~/.codex/skills/
+-- opencode/
|   +-- AGENTS.md                 # → symlink to claude-code/CLAUDE.md
|   +-- skills/                   # → ~/.config/opencode/skills/
+-- github-copilot/
|   +-- copilot-instructions.md   # → symlink to claude-code/CLAUDE.md
|   +-- skills/                   # → ~/.copilot/skills/
+-- mcp.json                      # normalized MCP config (see below)
+-- agents-anywhere.json          # manifest
```

Your primary agent's instructions (e.g., `CLAUDE.md`) become the source of truth. Other agents get symlinks with the correct filename for each tool. Edit once, synced everywhere.

## Supported Agents

| Agent | Instructions | Skills | Other portable files |
|---|---|---|---|
| Claude Code | `CLAUDE.md` | `skills/` | settings.json, keybindings.json, commands/ |
| Codex CLI | `AGENTS.md` | `skills/` | config.toml |
| OpenCode | `AGENTS.md` | `skills/` | opencode.json |
| Gemini CLI | `GEMINI.md` | `skills/` | settings.json, commands/ |
| Cursor | `rules/` | `skills/` | — |
| Windsurf | `rules/` | `skills/` | memories/ |
| GitHub Copilot CLI | `copilot-instructions.md` | `skills/` | — |
| Amazon Q Developer | `rules/` | `skills/` | — |
| Kiro | `steering/` | `skills/` | — |
| Antigravity | `GEMINI.md` | `skills/` | — |

**Planned:** Cline, Roo Code, Kilo Code, Amp, Augment, Zed, Trae, Continue.dev.

> Cursor, Windsurf, and Amazon Q only support project-level rules — global instructions are not synced for these agents.

## Device Sync

```bash
# Machine A — you changed your CLAUDE.md and added a skill
agents-anywhere push

# Machine B — get the changes
agents-anywhere pull
# post-merge hook auto-runs: agents-anywhere link && agents-anywhere mcp sync
```

No cloud, no accounts — just git.

## MCP Normalization

Every agent has a different MCP config format. agents-anywhere lets you write **one `mcp.json`** and generates the native format for each agent.

`init` auto-imports your existing MCP servers from all installed agents and merges them into a single `mcp.json`. Duplicates are resolved by keeping the richer config.

```json
{
  "servers": {
    "github": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": { "$env": "GITHUB_TOKEN" } }
    }
  }
}
```

```bash
$ agents-anywhere mcp sync

[OK] Claude Code — 1 server written to ~/.claude/.mcp.json
[OK] Codex CLI   — 1 server merged into ~/.codex/config.toml
[OK] Cursor      — 1 server written to ~/.cursor/mcp.json
...
```

Each agent gets its native format — correct root keys, env var syntax, transport naming. See the [MCP format table](#mcp-formats) for details.

## Commands

| Command | Description |
|---|---|
| `agents-anywhere init [dir]` | Detect agents, copy configs, import MCP, link — full setup |
| `agents-anywhere init --from <url>` | Clone an existing config repo and link |
| `agents-anywhere push` | Stage, commit, and push config changes to remote |
| `agents-anywhere pull` | Pull config changes (post-merge hook re-links) |
| `agents-anywhere link [agent]` | Symlink configs to agent directories |
| `agents-anywhere unlink [agent]` | Remove symlinks, restore backups |
| `agents-anywhere status` | Show link status per agent and file |
| `agents-anywhere agents` | List all known agents with install status |
| `agents-anywhere enable <agent>` | Enable an agent in the manifest |
| `agents-anywhere disable <agent>` | Disable an agent in the manifest |
| `agents-anywhere mcp sync` | Generate per-agent MCP configs from `mcp.json` |
| `agents-anywhere mcp add <name>` | Add an MCP server (interactive or with `--transport`, `--command`, `--url`, `--env` flags) |
| `agents-anywhere mcp remove <name>` | Remove an MCP server from `mcp.json` |
| `agents-anywhere mcp list` | Show all configured MCP servers |
| `agents-anywhere mcp diff` | Preview what `mcp sync` would change |
| `agents-anywhere doctor` | Diagnose broken symlinks, credentials in repo, stale configs |
| `agents-anywhere validate` | Validate bundled agent definition schemas |
| `agents-anywhere export` | Generate a standalone install script (no agents-anywhere needed) |

`link`, `unlink`, and `mcp sync` support `--dry-run`.

## How It Works

Each agent is defined by a JSON file — no TypeScript code needed. The definition declares:
- Where the agent stores config (`configDir`)
- What files are portable (`portable`: instructions, skills, settings)
- What to ignore (`ignore`: sessions, cache, credentials)
- How MCP configs are formatted (`mcp`: root key, env syntax, transport types)
- Whether the agent supports global instructions (`instructions.globalSupport`)

```bash
# Add support for a new agent = add one JSON file
agents/my-agent.json
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for the full schema and contribution guide.

## <a name="mcp-formats"></a>MCP Format Reference

| Agent | Output | Root key | Env syntax |
|---|---|---|---|
| Claude Code | `~/.claude/.mcp.json` | `mcpServers` | `${VAR}` |
| Codex CLI | `~/.codex/config.toml` (merged) | `[mcp_servers.*]` | `env_vars` array |
| OpenCode | `~/.config/opencode/opencode.json` (merged) | `mcp` | `{env:VAR}` |
| Gemini CLI | `~/.gemini/settings.json` (merged) | `mcpServers` | `${VAR}` |
| Cursor | `~/.cursor/mcp.json` | `mcpServers` | `${env:VAR}` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` | `${env:VAR}` |
| GitHub Copilot CLI | `~/.copilot/mcp-config.json` | `mcpServers` | `${VAR}` |
| Amazon Q Developer | `~/.aws/amazonq/mcp.json` | `mcpServers` | `${VAR}` |
| Kiro | `~/.kiro/settings/mcp.json` | `mcpServers` | `${VAR}` |
| Antigravity | `~/.gemini/antigravity/mcp_config.json` | `mcpServers` | `${VAR}` |

## License

MIT
