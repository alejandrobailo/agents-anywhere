import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { diffLocalVsRepo, copyLocalToRepo, type SyncDiff } from "../sync.js";
import type { DetectedAgent } from "../detector.js";
import type { AgentDefinition } from "../../schemas/agent-schema.js";

let tmpDir: string;
let configDir: string;
let repoDir: string;

function makeAgent(
  overrides: Partial<AgentDefinition> = {},
): DetectedAgent {
  const def = {
    id: "test-agent",
    name: "Test Agent",
    configDir: { darwin: configDir, linux: configDir, win32: configDir },
    detect: { type: "directory-exists" as const, path: configDir },
    portable: ["settings.json", "skills/**"],
    ignore: ["cache/**"],
    credentials: ["~/.secret.json"],
    instructions: {
      filename: "AGENTS.md",
      globalPath: `${configDir}/AGENTS.md`,
      globalSupport: true,
    },
    mcp: {
      configPath: "mcp.json",
      scope: "user" as const,
      rootKey: "mcpServers",
      format: "json" as const,
      writeMode: "standalone" as const,
      envSyntax: "${VAR}",
      transports: {
        stdio: { typeField: "type", typeValue: "stdio" },
        http: { typeField: "type", typeValue: "http" },
      },
      commandType: "string" as const,
      envKey: "env",
      envVarStyle: "inline" as const,
    },
    ...overrides,
  } as AgentDefinition;

  return { definition: def, configDir, installed: true };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-test-"));
  configDir = path.join(tmpDir, "agent-config");
  repoDir = path.join(tmpDir, "repo");
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(path.join(repoDir, "test-agent"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("diffLocalVsRepo", () => {
  it("detects local-only files", () => {
    fs.writeFileSync(path.join(configDir, "settings.json"), '{"local":true}');
    const diffs = diffLocalVsRepo([makeAgent()], repoDir);
    const localOnly = diffs.filter((d) => d.status === "local-only");
    expect(localOnly).toHaveLength(1);
    expect(localOnly[0].item).toBe("settings.json");
  });

  it("detects repo-only files", () => {
    fs.writeFileSync(
      path.join(repoDir, "test-agent", "settings.json"),
      '{"repo":true}',
    );
    const diffs = diffLocalVsRepo([makeAgent()], repoDir);
    const repoOnly = diffs.filter((d) => d.status === "repo-only");
    expect(repoOnly).toHaveLength(1);
    expect(repoOnly[0].item).toBe("settings.json");
  });

  it("detects diverged files", () => {
    fs.writeFileSync(path.join(configDir, "settings.json"), '{"local":true}');
    fs.writeFileSync(
      path.join(repoDir, "test-agent", "settings.json"),
      '{"repo":true}',
    );
    const diffs = diffLocalVsRepo([makeAgent()], repoDir);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].status).toBe("diverged");
  });

  it("returns empty when files are identical", () => {
    const content = '{"same":true}';
    fs.writeFileSync(path.join(configDir, "settings.json"), content);
    fs.writeFileSync(
      path.join(repoDir, "test-agent", "settings.json"),
      content,
    );
    const diffs = diffLocalVsRepo([makeAgent()], repoDir);
    expect(diffs).toHaveLength(0);
  });

  it("ignores symlinked local files", () => {
    const repoFile = path.join(repoDir, "test-agent", "settings.json");
    fs.writeFileSync(repoFile, '{"repo":true}');
    fs.symlinkSync(repoFile, path.join(configDir, "settings.json"));
    const diffs = diffLocalVsRepo([makeAgent()], repoDir);
    const localOnly = diffs.filter((d) => d.status === "local-only");
    expect(localOnly).toHaveLength(0);
  });

  it("respects ignore patterns", () => {
    fs.mkdirSync(path.join(configDir, "cache"), { recursive: true });
    fs.writeFileSync(path.join(configDir, "cache", "tmp.json"), "{}");
    const agent = makeAgent({ portable: ["cache/**", "settings.json"] });
    const diffs = diffLocalVsRepo([agent], repoDir);
    expect(diffs.filter((d) => d.item === "cache")).toHaveLength(0);
  });

  it("detects diverged directories with same entries but different file contents", () => {
    const localSkills = path.join(configDir, "skills");
    const repoSkills = path.join(repoDir, "test-agent", "skills");
    fs.mkdirSync(localSkills, { recursive: true });
    fs.mkdirSync(repoSkills, { recursive: true });
    fs.writeFileSync(path.join(localSkills, "my-skill.md"), "# Local version");
    fs.writeFileSync(path.join(repoSkills, "my-skill.md"), "# Repo version");
    const diffs = diffLocalVsRepo([makeAgent()], repoDir);
    const diverged = diffs.filter(
      (d) => d.status === "diverged" && d.item === "skills",
    );
    expect(diverged).toHaveLength(1);
  });

  it("detects local-only directories", () => {
    const skillsDir = path.join(configDir, "skills");
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, "my-skill.md"), "# Skill");
    const diffs = diffLocalVsRepo([makeAgent()], repoDir);
    const localOnly = diffs.filter(
      (d) => d.status === "local-only" && d.item === "skills",
    );
    expect(localOnly).toHaveLength(1);
  });
});

describe("copyLocalToRepo", () => {
  it("copies a file", () => {
    const localFile = path.join(configDir, "settings.json");
    fs.writeFileSync(localFile, '{"local":true}');
    const diff: SyncDiff = {
      agentId: "test-agent",
      agentName: "Test Agent",
      item: "settings.json",
      localPath: localFile,
      repoPath: path.join(repoDir, "test-agent", "settings.json"),
      status: "local-only",
    };
    copyLocalToRepo(diff);
    expect(fs.existsSync(diff.repoPath)).toBe(true);
    expect(fs.readFileSync(diff.repoPath, "utf-8")).toBe('{"local":true}');
  });

  it("copies a directory recursively", () => {
    const localDir = path.join(configDir, "skills");
    fs.mkdirSync(localDir, { recursive: true });
    fs.writeFileSync(path.join(localDir, "run.md"), "# Run");
    const diff: SyncDiff = {
      agentId: "test-agent",
      agentName: "Test Agent",
      item: "skills",
      localPath: localDir,
      repoPath: path.join(repoDir, "test-agent", "skills"),
      status: "local-only",
    };
    copyLocalToRepo(diff);
    expect(fs.existsSync(path.join(diff.repoPath, "run.md"))).toBe(true);
  });
});
