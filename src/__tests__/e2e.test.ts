/**
 * End-to-end integration test for the full init → link → mcp sync → unlink workflow.
 *
 * Uses a temporary directory as a fake HOME with fake ~/.claude/ and ~/.codex/ dirs.
 * Mocks os.homedir() so all path resolution uses the fake HOME.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { initCommand } from "../commands/init.js";
import { linkAgent, unlinkAgent, getStatus } from "../core/linker.js";
import { loadAgentById } from "../core/schema-loader.js";
import { parseMCPConfig } from "../mcp/parser.js";
import { transformForAgent } from "../mcp/transformer.js";
import { writeJSON, writeTOML, mergeJSON } from "../mcp/writer.js";
import { mcpSyncCommand } from "../commands/mcp-sync.js";
import * as TOML from "smol-toml";

let tmpDir: string;
let fakeHome: string;
let repoDir: string;

/** Sample normalized MCP config used across tests */
const testMCPConfig = {
  servers: {
    github: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: {
        GITHUB_TOKEN: { $env: "GITHUB_TOKEN" },
      },
    },
    sentry: {
      transport: "http",
      url: "https://mcp.sentry.dev/sse",
      headers: {
        Authorization: { $env: "SENTRY_TOKEN", prefix: "Bearer " },
      },
    },
  },
};

beforeEach(() => {
  // Create a unique temp dir for each test
  tmpDir = path.join(
    os.tmpdir(),
    `e2e-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  fakeHome = tmpDir;
  repoDir = path.join(tmpDir, "agentsync-config");

  // Create fake agent config dirs so detection works
  fs.mkdirSync(path.join(fakeHome, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(fakeHome, ".codex"), { recursive: true });

  // Mock os.homedir() so expandPath("~") resolves to our fake HOME
  vi.spyOn(os, "homedir").mockReturnValue(fakeHome);

  // Suppress console output during tests
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("e2e: init → link → mcp sync → unlink", () => {
  it("init creates repo structure with manifest, mcp.json, and per-agent dirs", async () => {
    await initCommand(repoDir);

    // Verify manifest
    const manifestPath = path.join(repoDir, "agentsync.json");
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.repoDir).toBe(repoDir);
    expect(manifest.agents["claude-code"]).toEqual({
      enabled: true,
      name: "Claude Code",
    });
    expect(manifest.agents["codex"]).toEqual({
      enabled: true,
      name: "Codex CLI",
    });

    // Verify empty mcp.json
    const mcpPath = path.join(repoDir, "mcp.json");
    expect(fs.existsSync(mcpPath)).toBe(true);
    const mcp = JSON.parse(fs.readFileSync(mcpPath, "utf-8"));
    expect(mcp).toEqual({ servers: {} });

    // Verify .gitignore
    expect(fs.existsSync(path.join(repoDir, ".gitignore"))).toBe(true);

    // Verify per-agent directories
    expect(fs.existsSync(path.join(repoDir, "claude-code"))).toBe(true);
    expect(fs.existsSync(path.join(repoDir, "codex"))).toBe(true);

    // Verify git repo was initialized
    expect(fs.existsSync(path.join(repoDir, ".git"))).toBe(true);

    // Verify post-merge hook
    const hookPath = path.join(repoDir, ".git", "hooks", "post-merge");
    expect(fs.existsSync(hookPath)).toBe(true);
    const hookContent = fs.readFileSync(hookPath, "utf-8");
    expect(hookContent).toContain("agentsync link");
    expect(hookContent).toContain("agentsync mcp sync");
  });

  it("link creates symlinks from agent config dirs to repo", async () => {
    await initCommand(repoDir);

    // Create portable files in repo
    fs.writeFileSync(
      path.join(repoDir, "claude-code", "settings.json"),
      '{"theme": "dark"}',
    );
    fs.writeFileSync(
      path.join(repoDir, "claude-code", "CLAUDE.md"),
      "# Claude Instructions",
    );
    fs.writeFileSync(
      path.join(repoDir, "codex", "AGENTS.md"),
      "# Codex Instructions",
    );

    const claudeDef = loadAgentById("claude-code")!;
    const codexDef = loadAgentById("codex")!;

    const claudeResults = linkAgent(claudeDef, repoDir);
    const codexResults = linkAgent(codexDef, repoDir);

    // Claude Code: settings.json and CLAUDE.md should be linked
    expect(claudeResults.length).toBeGreaterThan(0);
    const settingsResult = claudeResults.find(
      (r) => r.item === "settings.json",
    );
    expect(settingsResult?.action).toBe("linked");
    const claudeMdResult = claudeResults.find((r) => r.item === "CLAUDE.md");
    expect(claudeMdResult?.action).toBe("linked");

    // Verify actual symlinks
    const claudeConfigDir = path.join(fakeHome, ".claude");
    const settingsLink = path.join(claudeConfigDir, "settings.json");
    expect(fs.lstatSync(settingsLink).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(settingsLink)).toBe(
      path.join(repoDir, "claude-code", "settings.json"),
    );

    // Codex: AGENTS.md should be linked
    const codexMdResult = codexResults.find((r) => r.item === "AGENTS.md");
    expect(codexMdResult?.action).toBe("linked");
    const codexConfigDir = path.join(fakeHome, ".codex");
    const agentsMdLink = path.join(codexConfigDir, "AGENTS.md");
    expect(fs.lstatSync(agentsMdLink).isSymbolicLink()).toBe(true);
  });

  it("mcp sync generates correct Claude Code .mcp.json with ${VAR} syntax", async () => {
    await initCommand(repoDir);

    // Write normalized MCP config
    fs.writeFileSync(
      path.join(repoDir, "mcp.json"),
      JSON.stringify(testMCPConfig, null, 2),
    );

    const claudeDef = loadAgentById("claude-code")!;
    const config = parseMCPConfig(path.join(repoDir, "mcp.json"));
    const result = transformForAgent(config, claudeDef);

    // Write to Claude Code's config location
    const mcpOutputPath = path.join(fakeHome, ".claude", ".mcp.json");
    writeJSON(mcpOutputPath, result.rootKey, result.servers);

    // Verify output
    expect(fs.existsSync(mcpOutputPath)).toBe(true);
    const output = JSON.parse(fs.readFileSync(mcpOutputPath, "utf-8"));

    // Root key should be mcpServers
    expect(output.mcpServers).toBeDefined();

    // GitHub stdio server with ${VAR} env syntax
    expect(output.mcpServers.github).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: {
        GITHUB_TOKEN: "${GITHUB_TOKEN}",
      },
    });

    // Sentry HTTP server with Bearer prefix
    expect(output.mcpServers.sentry).toEqual({
      type: "http",
      url: "https://mcp.sentry.dev/sse",
      headers: {
        Authorization: "Bearer ${SENTRY_TOKEN}",
      },
    });
  });

  it("mcp sync generates correct Codex config.toml with env_vars syntax", async () => {
    await initCommand(repoDir);

    // Write normalized MCP config
    fs.writeFileSync(
      path.join(repoDir, "mcp.json"),
      JSON.stringify(testMCPConfig, null, 2),
    );

    const codexDef = loadAgentById("codex")!;
    const config = parseMCPConfig(path.join(repoDir, "mcp.json"));
    const result = transformForAgent(config, codexDef);

    // Write to Codex's config location
    const tomlOutputPath = path.join(fakeHome, ".codex", "config.toml");
    writeTOML(tomlOutputPath, result.rootKey, result.servers);

    // Verify output
    expect(fs.existsSync(tomlOutputPath)).toBe(true);
    const raw = fs.readFileSync(tomlOutputPath, "utf-8");
    const toml = TOML.parse(raw) as Record<string, unknown>;

    // Root key should be mcp_servers
    expect(toml.mcp_servers).toBeDefined();
    const servers = toml.mcp_servers as Record<
      string,
      Record<string, unknown>
    >;

    // GitHub stdio server with named env vars
    expect(servers.github.command).toBe("npx");
    expect(servers.github.args).toEqual([
      "-y",
      "@modelcontextprotocol/server-github",
    ]);
    expect(servers.github.env_vars).toEqual(["GITHUB_TOKEN"]);

    // Sentry HTTP server with bearer token env var
    expect(servers.sentry.url).toBe("https://mcp.sentry.dev/sse");
    expect(servers.sentry.bearer_token_env_var).toBe("SENTRY_TOKEN");
  });

  it("unlink removes symlinks and restores backups", async () => {
    await initCommand(repoDir);

    // Create an existing file in Claude config dir (will be backed up on link)
    const claudeConfigDir = path.join(fakeHome, ".claude");
    const originalSettings = '{"original": true}';
    fs.writeFileSync(
      path.join(claudeConfigDir, "settings.json"),
      originalSettings,
    );

    // Create portable file in repo
    fs.writeFileSync(
      path.join(repoDir, "claude-code", "settings.json"),
      '{"synced": true}',
    );

    const claudeDef = loadAgentById("claude-code")!;

    // Link — should back up existing settings.json
    const linkResults = linkAgent(claudeDef, repoDir);
    const settingsResult = linkResults.find(
      (r) => r.item === "settings.json",
    );
    expect(settingsResult?.action).toBe("backed-up-and-linked");

    // Verify symlink is in place
    const settingsPath = path.join(claudeConfigDir, "settings.json");
    expect(fs.lstatSync(settingsPath).isSymbolicLink()).toBe(true);

    // Unlink — should restore backup
    const unlinkResults = unlinkAgent(claudeDef, repoDir);
    const unlinkSettings = unlinkResults.find(
      (r) => r.item === "settings.json",
    );
    expect(unlinkSettings?.action).toBe("restored");

    // Verify symlink is gone and original file is restored
    expect(fs.lstatSync(settingsPath).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(settingsPath, "utf-8")).toBe(originalSettings);
  });

  it("full workflow: init → link → mcp sync → verify → unlink → verify", async () => {
    // Step 1: Init
    await initCommand(repoDir);
    expect(fs.existsSync(path.join(repoDir, "agentsync.json"))).toBe(true);

    // Step 2: Create portable files in repo
    fs.writeFileSync(
      path.join(repoDir, "claude-code", "settings.json"),
      '{"editor.theme": "dark"}',
    );
    fs.writeFileSync(
      path.join(repoDir, "codex", "AGENTS.md"),
      "# Codex global instructions",
    );

    // Step 3: Link both agents
    const claudeDef = loadAgentById("claude-code")!;
    const codexDef = loadAgentById("codex")!;
    linkAgent(claudeDef, repoDir);
    linkAgent(codexDef, repoDir);

    // Verify links via getStatus
    const claudeStatus = getStatus(claudeDef, repoDir);
    const linkedClaude = claudeStatus.filter((s) => s.status === "linked");
    expect(linkedClaude.length).toBeGreaterThan(0);

    const codexStatus = getStatus(codexDef, repoDir);
    const linkedCodex = codexStatus.filter((s) => s.status === "linked");
    expect(linkedCodex.length).toBeGreaterThan(0);

    // Step 4: Write MCP config and sync to both agents
    fs.writeFileSync(
      path.join(repoDir, "mcp.json"),
      JSON.stringify(testMCPConfig, null, 2),
    );

    const config = parseMCPConfig(path.join(repoDir, "mcp.json"));

    // Claude Code MCP sync
    const claudeTransform = transformForAgent(config, claudeDef);
    const claudeMcpPath = path.join(fakeHome, ".claude", ".mcp.json");
    writeJSON(
      claudeMcpPath,
      claudeTransform.rootKey,
      claudeTransform.servers,
    );

    // Codex MCP sync
    const codexTransform = transformForAgent(config, codexDef);
    const codexTomlPath = path.join(fakeHome, ".codex", "config.toml");
    writeTOML(codexTomlPath, codexTransform.rootKey, codexTransform.servers);

    // Verify Claude Code .mcp.json
    const claudeMcp = JSON.parse(fs.readFileSync(claudeMcpPath, "utf-8"));
    expect(claudeMcp.mcpServers.github.env.GITHUB_TOKEN).toBe(
      "${GITHUB_TOKEN}",
    );
    expect(claudeMcp.mcpServers.sentry.headers.Authorization).toBe(
      "Bearer ${SENTRY_TOKEN}",
    );

    // Verify Codex config.toml
    const codexToml = TOML.parse(
      fs.readFileSync(codexTomlPath, "utf-8"),
    ) as Record<string, unknown>;
    const codexServers = codexToml.mcp_servers as Record<
      string,
      Record<string, unknown>
    >;
    expect(codexServers.github.env_vars).toEqual(["GITHUB_TOKEN"]);
    expect(codexServers.sentry.bearer_token_env_var).toBe("SENTRY_TOKEN");

    // Step 5: Unlink both agents
    unlinkAgent(claudeDef, repoDir);
    unlinkAgent(codexDef, repoDir);

    // Verify unlinked
    const claudeStatusAfter = getStatus(claudeDef, repoDir);
    const linkedAfter = claudeStatusAfter.filter(
      (s) => s.status === "linked",
    );
    expect(linkedAfter).toHaveLength(0);

    const codexStatusAfter = getStatus(codexDef, repoDir);
    const linkedCodexAfter = codexStatusAfter.filter(
      (s) => s.status === "linked",
    );
    expect(linkedCodexAfter).toHaveLength(0);
  });

  it("mcpSyncCommand writes correct files via the command dispatcher", async () => {
    await initCommand(repoDir);

    // Write normalized MCP config
    fs.writeFileSync(
      path.join(repoDir, "mcp.json"),
      JSON.stringify(testMCPConfig, null, 2),
    );

    // Mock cwd so loadManifest finds agentsync.json
    vi.spyOn(process, "cwd").mockReturnValue(repoDir);

    await mcpSyncCommand();

    // Verify Claude Code output was written via the command
    const claudeMcpPath = path.join(fakeHome, ".claude", ".mcp.json");
    expect(fs.existsSync(claudeMcpPath)).toBe(true);
    const claudeMcp = JSON.parse(fs.readFileSync(claudeMcpPath, "utf-8"));
    expect(claudeMcp.mcpServers.github.env.GITHUB_TOKEN).toBe(
      "${GITHUB_TOKEN}",
    );

    // Verify Codex TOML output was written via the command
    const codexTomlPath = path.join(fakeHome, ".codex", "config.toml");
    expect(fs.existsSync(codexTomlPath)).toBe(true);
    const codexToml = TOML.parse(
      fs.readFileSync(codexTomlPath, "utf-8"),
    ) as Record<string, unknown>;
    const codexServers = codexToml.mcp_servers as Record<
      string,
      Record<string, unknown>
    >;
    expect(codexServers.github.env_vars).toEqual(["GITHUB_TOKEN"]);
  });

  it("mcpSyncCommand uses mergeJSON for merge-mode agents, preserving existing keys", async () => {
    await initCommand(repoDir);

    // Write normalized MCP config
    fs.writeFileSync(
      path.join(repoDir, "mcp.json"),
      JSON.stringify(testMCPConfig, null, 2),
    );

    // Enable opencode in manifest (it uses writeMode: "merge")
    const manifestPath = path.join(repoDir, "agentsync.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    manifest.agents["opencode"] = { enabled: true, name: "OpenCode" };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // Create pre-existing OpenCode config with non-MCP keys
    const opencodeConfigDir = path.join(fakeHome, ".config", "opencode");
    fs.mkdirSync(opencodeConfigDir, { recursive: true });
    const opencodeConfigPath = path.join(opencodeConfigDir, "opencode.json");
    fs.writeFileSync(
      opencodeConfigPath,
      JSON.stringify({ theme: "dark", fontSize: 14 }, null, 2),
    );

    // Mock cwd so loadManifest finds agentsync.json
    vi.spyOn(process, "cwd").mockReturnValue(repoDir);

    await mcpSyncCommand();

    // Verify OpenCode config preserved non-MCP keys (merge behavior)
    const opencodeOutput = JSON.parse(
      fs.readFileSync(opencodeConfigPath, "utf-8"),
    );
    expect(opencodeOutput.theme).toBe("dark");
    expect(opencodeOutput.fontSize).toBe(14);
    // And MCP servers were added
    expect(opencodeOutput.mcp).toBeDefined();
    expect(opencodeOutput.mcp.github).toBeDefined();
  });
});
