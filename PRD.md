# agentsync — Product Requirements Document

> Manage your AI coding agent configs in one place. One MCP config for every tool. Sync between devices with git.

## Problem

Developers increasingly use multiple AI coding agents (Claude Code, Codex, Cursor, Gemini CLI, OpenCode, etc.) across multiple devices. Each agent stores configuration in a different location, with a different format, and none of them sync.

The most painful manifestation: **MCP server configuration**. A developer using 4 agents must maintain 4 separate MCP configs with 4 different JSON schemas, 6 different env var syntaxes, and credentials scattered across all of them. Adding one MCP server means editing 4 files in 4 formats.

### Evidence of demand

- GitHub issue [anthropics/claude-code#22648](https://github.com/anthropics/claude-code/issues/22648): "Account-level settings sync" — 16 comments, 9 duplicate issues. Anthropic has not responded.
- Cursor forum: settings sync requested since 2023, still unshipped.
- 6+ community tools built for Claude Code sync alone (`claude-sync`, `claude-brain`, `ccms`, `dotclaude`, `claude-code-sync`, `agent-config`), all v0.1.x, none multi-agent.
- 12 of 14 major AI coding tools have **zero** built-in sync.
- Vercel's `skills` CLI (10.5K stars) proves developers want multi-agent tooling.

### Why existing solutions fall short

| Tool | Limitation |
|---|---|
| `claude-sync` | Claude-only, requires cloud account (S3/R2) |
| `agent-config` (288 stars) | Claude-only, no MCP normalization |
| `claude-brain` | Claude-only, requires API key for LLM merge |
| chezmoi / stow / yadm | Don't understand which agent files are portable vs device-specific |
| Git + symlinks (DIY) | Works, but no MCP normalization, no multi-agent awareness |

**The gap**: No tool combines multi-agent awareness + MCP normalization + device sync.

---

## Solution

**agentsync** is a CLI tool that:

1. **Links** your config to multiple AI agents from one central repo
2. **Normalizes** MCP server config across all agents (the killer feature)
3. **Syncs** between devices via git (no cloud, no accounts)

### What agentsync is NOT

- Not a cloud service — uses git, which developers already have
- Not a dotfile manager — it understands AI agent configs specifically
- Not an AI tool — no LLM calls, no API keys required
- Not a replacement for the `skills` CLI — skills handles skill installation, agentsync handles config management. They're complementary.

---

## Core Features

### Feature 1: Agent Detection & Linking

```bash
$ agentsync init

Detected 4 AI coding agents:
  ✓ Claude Code    ~/.claude
  ✓ Codex CLI      ~/.codex
  ✓ Gemini CLI     ~/.gemini
  ✓ Cursor         ~/.cursor

Created config repo at ~/agentsync-config
Run `agentsync link` to connect your agents.

$ agentsync link

[OK] Claude Code — settings.json, commands/, skills/ linked
[OK] Codex CLI   — config.toml, skills/ linked
[OK] Gemini CLI  — settings.json, commands/ linked
[OK] Cursor      — rules/ linked
```

**How it works:**
- Scans for installed agents by checking known config directories
- Creates symlinks from each agent's config dir to the central repo
- Only links portable files — ignores sessions, history, credentials automatically
- Backs up existing files before linking (`.backup.{timestamp}`)

### Feature 2: MCP Normalization (the differentiator)

One canonical MCP config that generates tool-specific configs automatically.

**The user writes:**

```json
// mcp.json — the only file you maintain
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

**agentsync generates** configs for every detected agent:

| Agent | Output file | Root key | Env syntax | Transport naming |
|---|---|---|---|---|
| Claude Code | `~/.claude/.mcp.json` | `mcpServers` | `${VAR}` | `stdio`, `http` |
| Codex | `~/.codex/config.toml` (merged) | `[mcp_servers.*]` | `env_vars`, `bearer_token_env_var` | implicit |
| OpenCode | `~/.config/opencode/opencode.json` (merged) | `mcp` | `{env:VAR}` | `local`, `remote` |
| Gemini CLI | `~/.gemini/settings.json` (merged) | `mcpServers` | `${VAR}` | implicit, `httpUrl` |
| Cursor | `~/.cursor/mcp.json` | `mcpServers` | `${env:VAR}` | `stdio`, URL-based |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` | `${env:VAR}` | `serverUrl` |

**Why this matters:**
- Adding an MCP server = edit ONE file, run `agentsync mcp sync`
- Credentials use `{ "$env": "VAR" }` — never stored in config, never committed to git
- Each tool gets its native format — no hacks, no workarounds

### Feature 3: Device Sync

Not a feature we build — it's just git.

```bash
# Device A: made changes
cd ~/agentsync-config && git add -A && git commit -m "add sentry MCP" && git push

# Device B: get changes
cd ~/agentsync-config && git pull
# Post-merge hook runs `agentsync link && agentsync mcp sync` automatically
```

The `init` command sets up a git `post-merge` hook so `git pull` automatically re-links and regenerates MCP configs.

---

## Agent Coverage

### Supported in v0.1 (MVP)

| Agent | Config dir | Config format | MCP support | Instructions file |
|---|---|---|---|---|
| Claude Code | `~/.claude` | JSON | `.mcp.json` | `CLAUDE.md` |
| Codex CLI | `~/.codex` | TOML | `config.toml` | `AGENTS.md` |

### v0.2

| Agent | Config dir | Config format | MCP support | Instructions file |
|---|---|---|---|---|
| OpenCode | `~/.config/opencode` | JSON | `opencode.json` | `AGENTS.md` |
| Gemini CLI | `~/.gemini` | JSON | `settings.json` | `GEMINI.md` |
| Cursor | `~/.cursor` | JSON | `.cursor/mcp.json` | `.cursor/rules/*.mdc` |

### v0.3+

Windsurf, Amp, Cline, Roo Code, Kilo Code, Amazon Q, Aider, Continue.dev, GitHub Copilot.

---

## Technical Design

### Agent definitions: declarative JSON, not code

Each agent is defined by a JSON schema file shipped with the package. Adding support for a new agent = adding one JSON file. No TypeScript code needed.

```json
{
  "id": "claude-code",
  "name": "Claude Code",
  "configDir": {
    "darwin": "~/.claude",
    "linux": "~/.claude",
    "win32": "%APPDATA%/claude"
  },
  "detect": {
    "type": "directory-exists",
    "path": "~/.claude"
  },
  "portable": [
    "settings.json",
    "keybindings.json",
    "CLAUDE.md",
    "commands/**",
    "skills/**"
  ],
  "ignore": [
    "history.jsonl",
    "projects/**",
    "sessions/**",
    "session-env/**",
    "shell-snapshots/**",
    "debug/**",
    "statsig/**",
    "telemetry/**",
    "todos/**",
    "file-history/**",
    "paste-cache/**",
    "cache/**",
    "ide/**",
    "plans/**",
    "downloads/**",
    "stats-cache.json",
    "*.backup.*"
  ],
  "credentials": [
    "~/.claude.json"
  ],
  "instructions": {
    "filename": "CLAUDE.md",
    "globalPath": "~/.claude/CLAUDE.md"
  },
  "mcp": {
    "configPath": ".mcp.json",
    "scope": "project-and-user",
    "rootKey": "mcpServers",
    "envSyntax": "${VAR}",
    "defaultSyntax": "${VAR:-default}",
    "transports": {
      "stdio": { "typeField": "type", "typeValue": "stdio" },
      "http": { "typeField": "type", "typeValue": "http" }
    },
    "commandType": "string",
    "envKey": "env"
  }
}
```

**Benefits:**
- Community can contribute agent definitions via PRs (just JSON)
- No risk of breaking TypeScript interfaces when a tool changes
- Easy to validate with JSON Schema
- Easy to test — just assert output against snapshots

### Repo structure (what the user manages)

```
agentsync-config/
├── agentsync.json          # Manifest: which agents, repo metadata
├── mcp.json                # Normalized MCP config (the one you edit)
├── claude-code/
│   ├── settings.json       # Symlinked to ~/.claude/settings.json
│   ├── CLAUDE.md           # Symlinked to ~/.claude/CLAUDE.md
│   ├── commands/           # Symlinked to ~/.claude/commands/
│   └── skills/             # Symlinked to ~/.claude/skills/
├── codex/
│   ├── config.toml         # Symlinked to ~/.codex/config.toml
│   ├── AGENTS.md           # Symlinked to ~/.codex/AGENTS.md
│   └── skills/             # Symlinked to ~/.codex/skills/
└── .gitignore              # Auto-generated: ignores credentials, generated MCP
```

### MCP generation pipeline

```
mcp.json (normalized)
    │
    ├── claude-code adapter → ~/.claude/.mcp.json
    ├── codex adapter       → merges into ~/.codex/config.toml
    ├── opencode adapter    → merges into ~/.config/opencode/opencode.json
    ├── gemini adapter      → merges into ~/.gemini/settings.json
    ├── cursor adapter      → ~/.cursor/mcp.json
    └── windsurf adapter    → ~/.codeium/windsurf/mcp_config.json
```

Generated MCP files are written directly to each agent's config directory (not symlinked), since they're derived from the normalized config plus tool-specific transformations.

### Tech stack

| Component | Choice | Rationale |
|---|---|---|
| Language | TypeScript | Target audience is developers who use AI coding tools |
| Runtime | Node.js 20+ | Universal, LTS |
| CLI framework | `commander` | Lightweight, well-documented |
| Git operations | `simple-git` | Most popular Node.js git library |
| TOML | `smol-toml` | Zero-dep, fast, read+write |
| YAML | `yaml` | Official YAML 1.2 parser |
| Test | `vitest` | Fast, Jest-compatible |
| Build | `tsup` | Fast TypeScript bundler |
| Distribution | npm | `npx agentsync init` — zero install |

---

## Implementation Plan

### Phase 1 — MVP (v0.1.0)

**Goal**: A developer using Claude Code + Codex can manage both from one repo.

- [ ] Project scaffold (TypeScript, tsup, vitest, commander)
- [ ] Agent schema loader (reads JSON definitions)
- [ ] Agent detector (scans filesystem for installed agents)
- [ ] `agentsync init` — detect agents, create repo, scaffold structure
- [ ] `agentsync link` — create symlinks from repo to agent config dirs
- [ ] `agentsync unlink` — remove symlinks, restore backups
- [ ] `agentsync status` — show what's linked, what's changed
- [ ] `agentsync mcp sync` — generate per-tool MCP from normalized config
- [ ] `agentsync mcp add <name>` — interactive: add an MCP server to mcp.json
- [ ] Agent definitions: `claude-code.json`, `codex.json`
- [ ] Git post-merge hook setup
- [ ] Test suite for MCP transformations (snapshot tests per agent)

### Phase 2 — Multi-agent (v0.2.0)

- [ ] Agent definitions: `opencode.json`, `gemini-cli.json`, `cursor.json`
- [ ] `agentsync agents` — list all detected agents with sync status
- [ ] `agentsync doctor` — check for broken symlinks, credentials in repo, stale configs
- [ ] `agentsync mcp diff` — preview what MCP sync would change
- [ ] MCP merge mode (merge into existing settings.json without overwriting other keys)
- [ ] Handle Codex TOML merge (inject `[mcp_servers]` section without touching rest of config)

### Phase 3 — Polish (v0.3.0)

- [ ] Agent definitions: `windsurf.json`, `amp.json`, `aider.json`, `cline.json`, `roo-code.json`
- [ ] `agentsync export` — generate a standalone install.sh (for sharing without agentsync)
- [ ] `agentsync mcp list` — show all configured MCP servers across all agents
- [ ] JSON Schema validation for agent definitions
- [ ] Dry-run mode (`--dry-run` on all commands)

### Phase 4 — Community (v1.0.0)

- [ ] Plugin system: `agentsync agent add <github-url>` to install community agent definitions
- [ ] Documentation website
- [ ] `agentsync init --from <git-url>` — clone an existing config repo
- [ ] GitHub Actions template for CI validation of config repos

---

## Competitive Landscape

| Tool | Stars | Approach | Multi-agent | MCP normalization | Device sync |
|---|---|---|---|---|---|
| `agent-config` (Brian Lovin) | 288 | Symlinks | Claude only | No | Git |
| `claude-sync` (tawanorg) | 23 | E2E encrypted push/pull | Claude only | No | S3/R2/GCS |
| `claude-brain` (toroleap) | 24 | LLM semantic merge | Claude only | No | Git |
| `ccms` (miwidot) | 28 | rsync over SSH | Claude only | No | SSH |
| `dotclaude` (daniel7an) | 3 | Git push/pull | Claude only | No | Git |
| AI Config (HN) | New | Multi-agent | Yes | No | Unknown |
| **agentsync** | — | Symlinks + MCP transform | **14+ agents** | **Yes** | Git |

### Why agentsync wins

1. **MCP normalization is uncontested** — nobody else does it
2. **Declarative agent schemas** — community can add agents without writing code
3. **Builds on proven conventions** — `.agents/skills/` (Vercel), `AGENTS.md` (Linux Foundation)
4. **Zero infrastructure** — git only, no cloud accounts, no API keys

---

## Success Metrics

| Metric | Target (6 months) |
|---|---|
| GitHub stars | 500+ |
| npm weekly downloads | 1,000+ |
| Agent definitions contributed by community | 5+ |
| MCP servers in default examples | 10+ |

---

## Open Questions

1. **Should generated MCP files be committed to the repo or gitignored?** Generated files are derived from `mcp.json` + agent schemas. Committing them adds noise; ignoring them means `git pull` alone isn't enough (need to run `agentsync mcp sync`). Current decision: gitignore them, rely on post-merge hook.

2. **How to handle agent config files that mix MCP with other settings?** Gemini CLI stores MCP in `settings.json` alongside other config. OpenCode stores it in `opencode.json`. Codex uses `config.toml`. The MCP sync needs to **merge** into these files without destroying non-MCP keys. This is the hardest technical challenge.

3. **Should we support a shared instructions.md?** A single Markdown file symlinked as `CLAUDE.md`, `AGENTS.md`, and `GEMINI.md` across agents. Pros: write once. Cons: agents interpret instructions differently, and the filenames themselves carry semantic meaning to each tool. Current decision: defer to v0.3, focus on per-agent instructions in MVP.

4. **Package name availability on npm.** Need to check if `agentsync` is available. Alternatives: `agent-sync`, `agentlink`, `dotai`.
