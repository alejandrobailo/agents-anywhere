import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentDefinition } from "../../schemas/agent-schema.js";
import {
  checkBrokenSymlinks,
  checkCredentialsInRepo,
  checkStaleConfigs,
  checkMCPFreshness,
} from "../doctor.js";

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
    credentials: ["~/.test-agent-creds.json"],
    instructions: { filename: "AGENTS.md", globalPath: `${configDir}/AGENTS.md` },
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
  tmpDir = fs.mkdtempSync(path.join(import.meta.dirname ?? __dirname, ".tmp-doctor-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("checkBrokenSymlinks", () => {
  it("returns no issues when no symlinks exist", () => {
    const agent = makeAgent();
    const repoDir = path.join(tmpDir, "repo");
    fs.mkdirSync(repoDir, { recursive: true });

    const issues = checkBrokenSymlinks([{ id: agent.id, def: agent }], repoDir);
    expect(issues).toEqual([]);
  });

  it("returns no issues when symlinks point to valid targets", () => {
    const agent = makeAgent();
    const repoDir = path.join(tmpDir, "repo");
    const configDir = agent.configDir.darwin;
    const agentRepoDir = path.join(repoDir, agent.id);

    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(agentRepoDir, { recursive: true });

    // Create valid target and symlink
    const targetFile = path.join(agentRepoDir, "settings.json");
    fs.writeFileSync(targetFile, "{}");
    fs.symlinkSync(targetFile, path.join(configDir, "settings.json"));

    const issues = checkBrokenSymlinks([{ id: agent.id, def: agent }], repoDir);
    expect(issues).toEqual([]);
  });

  it("detects broken symlinks pointing to non-existent targets", () => {
    const agent = makeAgent();
    const repoDir = path.join(tmpDir, "repo");
    const configDir = agent.configDir.darwin;

    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(repoDir, { recursive: true });

    // Create a symlink pointing to a non-existent file
    const brokenTarget = path.join(tmpDir, "does-not-exist", "settings.json");
    fs.symlinkSync(brokenTarget, path.join(configDir, "settings.json"));

    const issues = checkBrokenSymlinks([{ id: agent.id, def: agent }], repoDir);
    expect(issues).toHaveLength(1);
    expect(issues[0].agent).toBe("Test Agent");
    expect(issues[0].message).toContain("settings.json");
    expect(issues[0].message).toContain("target missing");
  });
});

describe("checkCredentialsInRepo", () => {
  it("returns no issues when no credential files are in the repo", () => {
    const agent = makeAgent();
    const repoDir = path.join(tmpDir, "repo");
    fs.mkdirSync(path.join(repoDir, agent.id), { recursive: true });

    const issues = checkCredentialsInRepo([{ id: agent.id, def: agent }], repoDir);
    expect(issues).toEqual([]);
  });

  it("detects credential file at repo root", () => {
    const agent = makeAgent();
    const repoDir = path.join(tmpDir, "repo");
    fs.mkdirSync(repoDir, { recursive: true });

    // Place a credential file at repo root
    fs.writeFileSync(path.join(repoDir, ".test-agent-creds.json"), "{}");

    const issues = checkCredentialsInRepo([{ id: agent.id, def: agent }], repoDir);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("repo root");
    expect(issues[0].fix).toContain(".gitignore");
  });

  it("detects credential file in agent subdirectory", () => {
    const agent = makeAgent();
    const repoDir = path.join(tmpDir, "repo");
    const agentDir = path.join(repoDir, agent.id);
    fs.mkdirSync(agentDir, { recursive: true });

    // Place a credential file in the agent dir
    fs.writeFileSync(path.join(agentDir, ".test-agent-creds.json"), "{}");

    const issues = checkCredentialsInRepo([{ id: agent.id, def: agent }], repoDir);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("test-agent/");
  });

  it("detects credentials in both root and agent dir", () => {
    const agent = makeAgent();
    const repoDir = path.join(tmpDir, "repo");
    const agentDir = path.join(repoDir, agent.id);
    fs.mkdirSync(agentDir, { recursive: true });

    fs.writeFileSync(path.join(repoDir, ".test-agent-creds.json"), "{}");
    fs.writeFileSync(path.join(agentDir, ".test-agent-creds.json"), "{}");

    const issues = checkCredentialsInRepo([{ id: agent.id, def: agent }], repoDir);
    expect(issues).toHaveLength(2);
  });
});

describe("checkStaleConfigs", () => {
  it("returns no issues when symlinked files exist in the repo", () => {
    const agent = makeAgent();
    const repoDir = path.join(tmpDir, "repo");
    const configDir = agent.configDir.darwin;
    const agentRepoDir = path.join(repoDir, agent.id);

    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(agentRepoDir, { recursive: true });

    // Create repo-side file and symlink pointing to it
    const repoFile = path.join(agentRepoDir, "settings.json");
    fs.writeFileSync(repoFile, "{}");
    fs.symlinkSync(repoFile, path.join(configDir, "settings.json"));

    const issues = checkStaleConfigs([{ id: agent.id, def: agent }], repoDir);
    expect(issues).toEqual([]);
  });

  it("detects symlinked items whose repo source is missing", () => {
    const agent = makeAgent();
    const repoDir = path.join(tmpDir, "repo");
    const configDir = agent.configDir.darwin;
    const agentRepoDir = path.join(repoDir, agent.id);

    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(agentRepoDir, { recursive: true });

    // Create a symlink but don't create the repo-side file
    // The symlink itself points to some arbitrary valid target (so it's not "broken"),
    // but the repo path doesn't exist (stale config)
    const dummyTarget = path.join(tmpDir, "dummy-target");
    fs.writeFileSync(dummyTarget, "{}");
    fs.symlinkSync(dummyTarget, path.join(configDir, "settings.json"));

    const issues = checkStaleConfigs([{ id: agent.id, def: agent }], repoDir);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("settings.json");
    expect(issues[0].message).toContain("missing from repo");
  });

  it("returns no issues when items are not symlinked", () => {
    const agent = makeAgent();
    const repoDir = path.join(tmpDir, "repo");
    const configDir = agent.configDir.darwin;

    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(repoDir, { recursive: true });

    // Regular file, not a symlink — no stale config
    fs.writeFileSync(path.join(configDir, "settings.json"), "{}");

    const issues = checkStaleConfigs([{ id: agent.id, def: agent }], repoDir);
    expect(issues).toEqual([]);
  });
});

describe("checkMCPFreshness", () => {
  it("returns no issues when mcp.json does not exist", () => {
    const agent = makeAgent();
    const repoDir = path.join(tmpDir, "repo");
    fs.mkdirSync(repoDir, { recursive: true });

    const issues = checkMCPFreshness([{ id: agent.id, def: agent }], repoDir);
    expect(issues).toEqual([]);
  });

  it("returns no issues when generated config is newer than mcp.json", () => {
    const agent = makeAgent();
    const repoDir = path.join(tmpDir, "repo");
    const configDir = agent.configDir.darwin;

    fs.mkdirSync(repoDir, { recursive: true });
    fs.mkdirSync(configDir, { recursive: true });

    // Write mcp.json first (older mtime)
    const mcpJsonPath = path.join(repoDir, "mcp.json");
    fs.writeFileSync(mcpJsonPath, "{}");

    // Set mcp.json mtime to the past
    const pastTime = new Date(Date.now() - 10_000);
    fs.utimesSync(mcpJsonPath, pastTime, pastTime);

    // Write generated config (newer mtime)
    const generatedPath = path.join(configDir, agent.mcp.configPath);
    fs.writeFileSync(generatedPath, "{}");

    const issues = checkMCPFreshness([{ id: agent.id, def: agent }], repoDir);
    expect(issues).toEqual([]);
  });

  it("detects stale generated config older than mcp.json", () => {
    const agent = makeAgent();
    const repoDir = path.join(tmpDir, "repo");
    const configDir = agent.configDir.darwin;

    fs.mkdirSync(repoDir, { recursive: true });
    fs.mkdirSync(configDir, { recursive: true });

    // Write generated config first (older)
    const generatedPath = path.join(configDir, agent.mcp.configPath);
    fs.writeFileSync(generatedPath, "{}");

    // Set generated config mtime to the past
    const pastTime = new Date(Date.now() - 10_000);
    fs.utimesSync(generatedPath, pastTime, pastTime);

    // Write mcp.json (newer)
    fs.writeFileSync(path.join(repoDir, "mcp.json"), "{}");

    const issues = checkMCPFreshness([{ id: agent.id, def: agent }], repoDir);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("older than mcp.json");
    expect(issues[0].fix).toContain("mcp sync");
  });

  it("skips agents whose generated config does not exist yet", () => {
    const agent = makeAgent();
    const repoDir = path.join(tmpDir, "repo");

    fs.mkdirSync(repoDir, { recursive: true });
    fs.writeFileSync(path.join(repoDir, "mcp.json"), "{}");

    // No generated config file — not an issue (it just hasn't been synced yet)
    const issues = checkMCPFreshness([{ id: agent.id, def: agent }], repoDir);
    expect(issues).toEqual([]);
  });
});
