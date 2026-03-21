<p align="center">
  <h1 align="center">agents-anywhere</h1>
  <p align="center">
    Your AI agent configs, skills, and instructions — on every device.
    <br />
    <b>One config repo. Every agent. Every machine.</b>
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/agents-anywhere"><img alt="npm version" src="https://img.shields.io/npm/v/agents-anywhere?style=flat-square&color=cb3837" /></a>
    <a href="https://www.npmjs.com/package/agents-anywhere"><img alt="npm downloads" src="https://img.shields.io/npm/dm/agents-anywhere?style=flat-square&color=blue" /></a>
    <a href="https://github.com/alejandrobailo/agents-anywhere/blob/main/LICENSE"><img alt="license" src="https://img.shields.io/github/license/alejandrobailo/agents-anywhere?style=flat-square" /></a>
  </p>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/alejandrobailo/agents-anywhere/main/assets/demo-init.gif" alt="agents-anywhere init demo" width="800" />
</p>

---

You've spent hours perfecting your `CLAUDE.md`, building custom skills, tuning your settings. Then you open your laptop and none of it is there. Or you switch from Claude Code to Codex and start from scratch.

**agents-anywhere** keeps your agent setup in a git repo and symlinks it to every agent on every machine.

## Quick Start

```bash
# New setup — one command does everything
npx agents-anywhere init

# New device — clone your existing config
npx agents-anywhere init --from https://github.com/you/agents-anywhere-config.git
```

That's it. `init` detects your installed agents, picks a primary, copies configs, imports MCP servers, creates symlinks, and optionally pushes to a private GitHub repo.

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

> Cursor, Windsurf, and Amazon Q only support project-level rules — global instructions are not synced for these agents.

**Planned:** Cline, Roo Code, Kilo Code, Amp, Augment, Zed, Trae, Continue.dev.

## Device Sync

```bash
# Machine A — you changed your CLAUDE.md and added a skill
agents-anywhere push

# Machine B — get the changes
agents-anywhere pull
# post-merge hook auto-runs: link + mcp sync
```

No cloud, no accounts — just git.

## What Gets Synced

```
agents-anywhere-config/           # your git repo
├── claude-code/
│   ├── CLAUDE.md                 # → ~/.claude/CLAUDE.md (source of truth)
│   ├── settings.json             # → ~/.claude/settings.json
│   ├── skills/                   # → ~/.claude/skills/
│   └── commands/                 # → ~/.claude/commands/
├── codex/
│   ├── AGENTS.md                 # → symlink to claude-code/CLAUDE.md
│   ├── config.toml               # → ~/.codex/config.toml
│   └── skills/                   # → ~/.codex/skills/
├── opencode/
│   ├── AGENTS.md                 # → symlink to claude-code/CLAUDE.md
│   └── skills/                   # → ~/.config/opencode/skills/
├── mcp.json                      # normalized MCP config
└── agents-anywhere.json          # manifest
```

Your primary agent's instructions (e.g., `CLAUDE.md`) become the source of truth. Other agents get symlinks with the correct filename. Edit once, synced everywhere.

## MCP Normalization

Every agent has a different MCP config format. Write **one `mcp.json`**, get the native format for each agent.

`init` auto-imports your existing MCP servers from all installed agents and deduplicates them.

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

✓ Claude Code     — wrote ~/.claude/.mcp.json
✓ Codex CLI       — merged into ~/.codex/config.toml
✓ Cursor          — wrote ~/.cursor/mcp.json
✓ Gemini CLI      — merged into ~/.gemini/settings.json
...
```

Each agent gets its native format — correct root keys, env var syntax, transport naming.

<details>
<summary><b>MCP Format Reference</b></summary>

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

</details>

## Commands

| Command | Description |
|---|---|
| `init [dir]` | Detect agents, copy configs, import MCP, link — full setup |
| `init --from <url>` | Clone an existing config repo and link |
| `push` | Stage, commit, and push config changes to remote |
| `pull` | Pull config changes (post-merge hook re-links) |
| `link [agent]` | Symlink configs to agent directories |
| `unlink [agent]` | Remove symlinks, restore backups |
| `status` | Show link status per agent and file |
| `agents` | List all known agents with install status |
| `enable <agent>` | Enable an agent in the manifest |
| `disable <agent>` | Disable an agent in the manifest |
| `mcp sync` | Generate per-agent MCP configs from `mcp.json` |
| `mcp add <name>` | Add an MCP server interactively or with flags |
| `mcp remove <name>` | Remove an MCP server |
| `mcp list` | Show all configured MCP servers |
| `mcp diff` | Preview what `mcp sync` would change |
| `doctor` | Diagnose broken symlinks, credentials in repo, stale configs |
| `validate` | Validate bundled agent definition schemas |
| `export` | Generate a standalone install script |

`link`, `unlink`, and `mcp sync` support `--dry-run`.

## How It Works

Each agent is defined by a JSON file — no TypeScript code needed:

```bash
# Add support for a new agent = add one JSON file
agents/my-agent.json
```

The definition declares where configs live, what files are portable, what to ignore, how MCP is formatted, and whether the agent supports global instructions.

See [DEVELOPMENT.md](DEVELOPMENT.md) for the full schema and contribution guide.

## License

MIT
