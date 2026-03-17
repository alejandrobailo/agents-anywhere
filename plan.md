# agentsync MVP: Project Scaffold & Core Features

## Overview

Build the v0.1.0 MVP of agentsync — a CLI tool that links AI coding agent configs from a central repo and normalizes MCP server configuration across agents. Starting with Claude Code + Codex CLI support.

**Reference:** `PRD.md`

---

## Tasks

```json
[
  {
    "id": "SETUP-001",
    "category": "setup",
    "priority": 1,
    "description": "Scaffold TypeScript project with tsup, vitest, commander, and npm package config",
    "steps": [
      "Initialize npm package with name 'agentsync', bin entry pointing to dist/cli.js",
      "Install dev dependencies: typescript, tsup, vitest, @types/node",
      "Install dependencies: commander, simple-git, smol-toml, yaml",
      "Create tsconfig.json targeting ES2022, NodeNext module resolution",
      "Create tsup.config.ts with entry src/cli.ts, format cjs+esm, dts generation",
      "Create src/cli.ts with commander program skeleton: init, link, unlink, status, agents, mcp (subcommands: sync, add, list)",
      "Add bin shebang (#!/usr/bin/env node) to cli entry",
      "Add scripts: build, dev, test, lint to package.json",
      "Run npx tsc --noEmit to verify setup"
    ],
    "passes": true
  },
  {
    "id": "SETUP-002",
    "category": "setup",
    "priority": 2,
    "description": "Create agent definition JSON schema and load system for declarative agent configs",
    "steps": [
      "Create src/schemas/ directory",
      "Create src/schemas/agent-schema.ts with TypeScript types matching the agent definition format in PRD.md (AgentDefinition, MCPConfig, TransportMap, etc.)",
      "Create src/core/schema-loader.ts that reads JSON files from a bundled agents/ directory",
      "Create agents/ directory at project root with claude-code.json and codex.json definitions (use exact data from PRD.md)",
      "Ensure tsup bundles the agents/ directory (or copy them to dist/agents/ in build step)",
      "Write test: src/core/__tests__/schema-loader.test.ts — verify loading both agent definitions, validate required fields exist",
      "Run npx tsc --noEmit"
    ],
    "passes": true
  },
  {
    "id": "FEAT-001",
    "category": "feature",
    "priority": 3,
    "description": "Implement agent detector that scans filesystem for installed AI coding agents",
    "steps": [
      "Create src/core/detector.ts",
      "Implement detectAgents() that loads all agent definitions, checks each detect rule (directory-exists), returns list of DetectedAgent objects with { definition, configDir, installed: boolean }",
      "Handle ~ expansion to process.env.HOME",
      "Handle platform-specific configDir (darwin/linux/win32)",
      "Write test: src/core/__tests__/detector.test.ts — mock fs.existsSync to test detection logic",
      "Run npx tsc --noEmit"
    ],
    "passes": true
  },
  {
    "id": "FEAT-002",
    "category": "feature",
    "priority": 4,
    "description": "Implement symlink manager for linking/unlinking agent configs to a central repo",
    "steps": [
      "Create src/core/linker.ts",
      "Implement linkAgent(agentDef, repoDir) — for each portable file/dir, create symlink from agent configDir to repoDir/agentId/",
      "Before linking, backup existing real files to .backup.{timestamp}",
      "If symlink already points correctly, skip with 'already linked' message",
      "Implement unlinkAgent(agentDef, repoDir) — remove symlinks, restore most recent backup if exists",
      "Implement getStatus(agentDef, repoDir) — return link status for each portable file (linked, unlinked, diverged, missing)",
      "Write test: src/core/__tests__/linker.test.ts — test link creation, backup, idempotency, unlink with restore",
      "Run npx tsc --noEmit"
    ],
    "passes": true
  },
  {
    "id": "FEAT-003",
    "category": "feature",
    "priority": 5,
    "description": "Implement MCP config normalizer — parse normalized mcp.json and transform to per-agent formats",
    "steps": [
      "Create src/mcp/types.ts with NormalizedMCPConfig, NormalizedServer, EnvRef types from PRD.md",
      "Create src/mcp/parser.ts — parse mcp.json, validate structure, extract server definitions",
      "Create src/mcp/transformer.ts with transformForAgent(normalizedConfig, agentDefinition) function",
      "Handle env var syntax transformation: { $env: 'VAR' } → '${VAR}' (Claude), '{env:VAR}' (OpenCode), '${env:VAR}' (Cursor/Windsurf), named refs (Codex)",
      "Handle transport naming: stdio/http → local/remote (OpenCode), httpUrl (Gemini), serverUrl (Windsurf)",
      "Handle command type: string (most) vs array (OpenCode)",
      "Handle root key: mcpServers (most), mcp (OpenCode), servers (VS Code), [mcp_servers.*] (Codex TOML)",
      "Handle prefix in headers: { $env: 'TOKEN', prefix: 'Bearer ' } → 'Bearer ${TOKEN}'",
      "Write test: src/mcp/__tests__/transformer.test.ts — snapshot tests for Claude Code and Codex output from same normalized input",
      "Run npx tsc --noEmit"
    ],
    "passes": true
  },
  {
    "id": "FEAT-004",
    "category": "feature",
    "priority": 6,
    "description": "Implement MCP writer — write transformed configs to each agent's expected location and format",
    "steps": [
      "Create src/mcp/writer.ts",
      "Implement writeJSON(path, rootKey, servers) — write JSON MCP config (for Claude Code, Cursor, Windsurf)",
      "Implement writeTOML(path, servers) — write/merge TOML [mcp_servers] section into existing config.toml without destroying other keys (for Codex)",
      "Implement mergeJSON(path, key, servers) — merge MCP into existing JSON file without overwriting non-MCP keys (for Gemini, OpenCode)",
      "Use smol-toml for TOML read/write",
      "Write test: src/mcp/__tests__/writer.test.ts — test JSON write, TOML merge preserving existing keys, JSON merge preserving existing keys",
      "Run npx tsc --noEmit"
    ],
    "passes": true
  },
  {
    "id": "FEAT-005",
    "category": "feature",
    "priority": 7,
    "description": "Wire up CLI commands: init, link, unlink, status, agents",
    "steps": [
      "Implement 'agentsync init' in src/commands/init.ts — detect agents, create repo dir (default ~/agentsync-config), scaffold agentsync.json + per-agent dirs + .gitignore + empty mcp.json, git init, set up post-merge hook",
      "Implement 'agentsync link' in src/commands/link.ts — link all enabled agents (or specific agent if arg provided), show colored output",
      "Implement 'agentsync unlink' in src/commands/unlink.ts — unlink all or specific agent, restore backups",
      "Implement 'agentsync status' in src/commands/status.ts — show table of agents with link status per portable file",
      "Implement 'agentsync agents' in src/commands/agents.ts — list all known agents, mark installed/linked",
      "Create src/utils/output.ts with colored console helpers (info, warn, error, table)",
      "Run npx tsc --noEmit"
    ],
    "passes": false
  },
  {
    "id": "FEAT-006",
    "category": "feature",
    "priority": 8,
    "description": "Wire up MCP CLI commands: mcp sync, mcp add, mcp list",
    "steps": [
      "Implement 'agentsync mcp sync' in src/commands/mcp-sync.ts — read mcp.json from repo, transform for each enabled agent, write to agent config dirs, show summary",
      "Implement 'agentsync mcp add' in src/commands/mcp-add.ts — interactive prompts: server name, transport (stdio/http), command or URL, env vars → append to mcp.json",
      "Implement 'agentsync mcp list' in src/commands/mcp-list.ts — read mcp.json, show table of servers with transport type and env vars",
      "Run npx tsc --noEmit"
    ],
    "passes": false
  },
  {
    "id": "TEST-001",
    "category": "test",
    "priority": 9,
    "description": "Add end-to-end integration test for full init → link → mcp sync workflow",
    "steps": [
      "Create src/__tests__/e2e.test.ts",
      "Use tmp directory as fake HOME with fake ~/.claude/ and ~/.codex/ dirs",
      "Test full flow: init creates repo structure, link creates symlinks, mcp sync generates correct files",
      "Verify Claude Code .mcp.json has correct format with ${VAR} syntax",
      "Verify Codex config.toml has correct [mcp_servers] section with env_vars syntax",
      "Verify unlink removes symlinks and restores backups",
      "Run vitest to ensure all tests pass"
    ],
    "passes": false
  },
  {
    "id": "FEAT-007",
    "category": "feature",
    "priority": 10,
    "description": "Add README.md with installation, usage examples, and agent coverage table",
    "steps": [
      "Create README.md with: project description, quick start (npx agentsync init), feature overview, MCP normalization example, supported agents table, contributing guide for agent definitions",
      "Add LICENSE file (MIT)",
      "Add .npmignore to exclude test files, src/ from published package",
      "Verify npx tsc --noEmit passes",
      "Run vitest to ensure all tests pass",
      "Run npm pack --dry-run to verify package contents"
    ],
    "passes": false
  }
]
```
