import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentDefinition } from "../../schemas/agent-schema.js";
import {
  generateExportScript,
  type AgentExportInfo,
} from "../export.js";

let tmpDir: string;

/** Create a minimal agent definition for testing */
function makeAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  const configDir = path.join(tmpDir, "agent-config");
  return {
    id: "test-agent",
    name: "Test Agent",
    configDir: { darwin: configDir, linux: configDir, win32: configDir },
    detect: { type: "directory-exists", path: configDir },
    portable: ["settings.json", "commands/**"],
    ignore: [],
    credentials: [],
    instructions: {
      filename: "AGENTS.md",
      globalPath: `${configDir}/AGENTS.md`,
    },
    mcp: {
      configPath: ".mcp.json",
      scope: "user",
      rootKey: "mcpServers",
      format: "json",
      writeMode: "standalone",
      envSyntax: "${VAR}",
      transports: {
        stdio: { typeField: "type", typeValue: "stdio" },
        http: { typeField: "type", typeValue: "http" },
      },
      commandType: "string",
      envKey: "env",
      envVarStyle: "inline",
    },
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "export-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("generateExportScript", () => {
  it("starts with a valid bash shebang and set flags", () => {
    const script = generateExportScript(tmpDir, "{}", []);
    const lines = script.split("\n");
    expect(lines[0]).toBe("#!/bin/bash");
    expect(script).toContain("set -euo pipefail");
  });

  it("includes mcp.json content inline", () => {
    const mcpRaw = JSON.stringify(
      {
        servers: {
          github: {
            transport: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: { GITHUB_TOKEN: { $env: "GITHUB_TOKEN" } },
          },
        },
      },
      null,
      2,
    );

    const script = generateExportScript(tmpDir, mcpRaw, []);
    expect(script).toContain("cat > \"$REPO_DIR/mcp.json\"");
    expect(script).toContain("@modelcontextprotocol/server-github");
    expect(script).toContain("GITHUB_TOKEN");
    expect(script).toContain("AGENTSYNC_MCP_EOF");
  });

  it("includes mkdir -p calls for agent config dirs", () => {
    const agentDef = makeAgent({ id: "claude-code", name: "Claude Code" });
    const agentInfo: AgentExportInfo = {
      agentDef,
      configDir: path.join(tmpDir, "agent-config"),
      mcpTargetPath: path.join(tmpDir, "agent-config", ".mcp.json"),
      mcpContent: '{"mcpServers":{}}\n',
      portableItems: ["settings.json", "commands"],
    };

    const script = generateExportScript(tmpDir, "{}", [agentInfo]);
    expect(script).toContain('mkdir -p "$REPO_DIR/claude-code"');
    expect(script).toContain('mkdir -p "$AGENT_CONFIG_DIR"');
  });

  it("includes symlink creation for portable files", () => {
    const agentDef = makeAgent({ id: "test-agent", name: "Test Agent" });
    const agentInfo: AgentExportInfo = {
      agentDef,
      configDir: path.join(tmpDir, "agent-config"),
      mcpTargetPath: path.join(tmpDir, "agent-config", ".mcp.json"),
      mcpContent: '{"mcpServers":{}}\n',
      portableItems: ["settings.json", "commands"],
    };

    const script = generateExportScript(tmpDir, "{}", [agentInfo]);
    // Should contain ln -s for symlink creation
    expect(script).toContain('ln -s "$SRC" "$DEST"');
    // Should check source existence before symlinking
    expect(script).toContain(
      'if [ -e "$REPO_DIR/test-agent/settings.json" ]; then',
    );
    expect(script).toContain(
      'if [ -e "$REPO_DIR/test-agent/commands" ]; then',
    );
    // Should backup existing non-symlink files
    expect(script).toContain('mv "$DEST" "$DEST.backup.$(date +%s)"');
  });

  it("writes per-agent MCP config inline with heredoc", () => {
    const mcpContent = JSON.stringify(
      {
        mcpServers: {
          github: {
            type: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" },
          },
        },
      },
      null,
      2,
    ) + "\n";

    const agentDef = makeAgent({ id: "claude-code", name: "Claude Code" });
    const agentInfo: AgentExportInfo = {
      agentDef,
      configDir: path.join(tmpDir, "agent-config"),
      mcpTargetPath: path.join(tmpDir, "agent-config", ".mcp.json"),
      mcpContent,
      portableItems: [],
    };

    const script = generateExportScript(tmpDir, "{}", [agentInfo]);
    // The heredoc delimiter should include the agent id
    expect(script).toContain("AGENTSYNC_EOF_CLAUDE_CODE");
    // The MCP content should be in the script
    expect(script).toContain("@modelcontextprotocol/server-github");
    expect(script).toContain('"${GITHUB_TOKEN}"');
  });

  it("handles multiple agents", () => {
    const agent1 = makeAgent({ id: "claude-code", name: "Claude Code" });
    const agent2 = makeAgent({ id: "cursor", name: "Cursor" });

    const info1: AgentExportInfo = {
      agentDef: agent1,
      configDir: path.join(tmpDir, "claude-config"),
      mcpTargetPath: path.join(tmpDir, "claude-config", ".mcp.json"),
      mcpContent: '{"mcpServers":{}}\n',
      portableItems: ["settings.json"],
    };
    const info2: AgentExportInfo = {
      agentDef: agent2,
      configDir: path.join(tmpDir, "cursor-config"),
      mcpTargetPath: path.join(tmpDir, "cursor-config", "mcp.json"),
      mcpContent: '{"mcpServers":{}}\n',
      portableItems: ["rules"],
    };

    const script = generateExportScript(tmpDir, "{}", [info1, info2]);
    expect(script).toContain("# --- Claude Code ---");
    expect(script).toContain("# --- Cursor ---");
    expect(script).toContain('mkdir -p "$REPO_DIR/claude-code"');
    expect(script).toContain('mkdir -p "$REPO_DIR/cursor"');
    expect(script).toContain('echo "2 agent(s) configured from $REPO_DIR"');
  });

  it("replaces home directory with $HOME for portability", () => {
    const home = os.homedir();
    const repoDir = path.join(home, "agentsync-config");
    const configDir = path.join(home, ".claude");

    const agentDef = makeAgent({ id: "claude-code", name: "Claude Code" });
    const agentInfo: AgentExportInfo = {
      agentDef,
      configDir,
      mcpTargetPath: path.join(configDir, ".mcp.json"),
      mcpContent: '{"mcpServers":{}}\n',
      portableItems: [],
    };

    const script = generateExportScript(repoDir, "{}", [agentInfo]);
    expect(script).toContain('REPO_DIR="$HOME/agentsync-config"');
    expect(script).toContain('AGENT_CONFIG_DIR="$HOME/.claude"');
    // Should NOT contain the literal home directory path
    expect(script).not.toContain(`"${home}/agentsync-config"`);
  });

  it("produces script with no empty agent section when portableItems is empty", () => {
    const agentDef = makeAgent({ id: "test-agent", name: "Test Agent" });
    const agentInfo: AgentExportInfo = {
      agentDef,
      configDir: path.join(tmpDir, "agent-config"),
      mcpTargetPath: path.join(tmpDir, "agent-config", ".mcp.json"),
      mcpContent: '{"mcpServers":{}}\n',
      portableItems: [],
    };

    const script = generateExportScript(tmpDir, "{}", [agentInfo]);
    // Should not contain symlink commands when no portable items
    expect(script).not.toContain("# Symlinks for Test Agent");
    expect(script).not.toContain("ln -s");
    // But should still write MCP config
    expect(script).toContain("AGENTSYNC_EOF_TEST_AGENT");
  });

  it("generates a well-formed bash script (no unclosed quotes or heredocs)", () => {
    const mcpRaw = JSON.stringify(
      {
        servers: {
          github: {
            transport: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: { GITHUB_TOKEN: { $env: "GITHUB_TOKEN" } },
          },
        },
      },
      null,
      2,
    );

    const agent1 = makeAgent({
      id: "claude-code",
      name: "Claude Code",
      portable: ["settings.json", "commands/**", "skills/**"],
    });
    const agent2 = makeAgent({
      id: "codex",
      name: "Codex CLI",
      portable: ["config.toml", "AGENTS.md"],
    });

    const info1: AgentExportInfo = {
      agentDef: agent1,
      configDir: path.join(tmpDir, "claude"),
      mcpTargetPath: path.join(tmpDir, "claude", ".mcp.json"),
      mcpContent: '{"mcpServers":{"github":{}}}\n',
      portableItems: ["settings.json", "commands", "skills"],
    };
    const info2: AgentExportInfo = {
      agentDef: agent2,
      configDir: path.join(tmpDir, "codex"),
      mcpTargetPath: path.join(tmpDir, "codex", "config.toml"),
      mcpContent: '[mcp_servers]\n',
      portableItems: ["config.toml", "AGENTS.md"],
    };

    const script = generateExportScript(tmpDir, mcpRaw, [info1, info2]);

    // Every heredoc opener must have a corresponding closer
    const heredocOpeners = script.match(/<< '(\w+)'/g) || [];
    for (const opener of heredocOpeners) {
      const delimiter = opener.replace("<< '", "").replace("'", "");
      // The delimiter must appear as a standalone line (closing the heredoc)
      const closerRegex = new RegExp(`^${delimiter}$`, "m");
      expect(script).toMatch(closerRegex);
    }

    // Every if should have a fi
    const ifCount = (script.match(/^if \[/gm) || []).length;
    const fiCount = (script.match(/^fi$/gm) || []).length;
    expect(ifCount).toBe(fiCount);

    // Script should end with a newline
    expect(script.endsWith("\n")).toBe(true);
  });
});
