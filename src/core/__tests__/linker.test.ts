import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readlinkSync,
  readFileSync,
  rmSync,
  lstatSync,
  readdirSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import { linkAgent, unlinkAgent, getStatus } from "../linker.js";
import type { AgentDefinition } from "../../schemas/agent-schema.js";

let tmpDir: string;
let configDir: string;
let repoDir: string;

function makeAgentDef(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: "test-agent",
    name: "Test Agent",
    configDir: {
      darwin: configDir,
      linux: configDir,
      win32: configDir,
    },
    detect: {
      type: "directory-exists",
      path: configDir,
    },
    portable: ["settings.json", "commands/**"],
    ignore: ["cache/**"],
    credentials: [],
    instructions: { filename: "AGENTS.md", globalPath: `${configDir}/AGENTS.md` },
    mcp: {
      configPath: "mcp.json",
      scope: "user",
      rootKey: "mcpServers",
      format: "json",
      writeMode: "standalone",
      envSyntax: "${VAR}",
      transports: {
        stdio: { typeField: "type", typeValue: "stdio" },
      },
      commandType: "string",
      envKey: "env",
      envVarStyle: "inline",
    },
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = path.join(os.tmpdir(), `linker-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  configDir = path.join(tmpDir, "agent-config");
  repoDir = path.join(tmpDir, "repo");

  mkdirSync(configDir, { recursive: true });
  mkdirSync(path.join(repoDir, "test-agent"), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("linker", () => {
  describe("linkAgent", () => {
    it("creates symlinks for portable files that exist in repo", () => {
      const repoFile = path.join(repoDir, "test-agent", "settings.json");
      writeFileSync(repoFile, '{"key": "value"}');

      const results = linkAgent(makeAgentDef(), repoDir);

      expect(results).toHaveLength(1);
      expect(results[0].action).toBe("linked");
      expect(results[0].item).toBe("settings.json");

      const agentFile = path.join(configDir, "settings.json");
      expect(lstatSync(agentFile).isSymbolicLink()).toBe(true);
      expect(readlinkSync(agentFile)).toBe(repoFile);
    });

    it("creates symlinks for directories", () => {
      const repoCommandsDir = path.join(repoDir, "test-agent", "commands");
      mkdirSync(repoCommandsDir, { recursive: true });
      writeFileSync(path.join(repoCommandsDir, "run.md"), "# Run");

      const results = linkAgent(makeAgentDef(), repoDir);

      const commandsResult = results.find((r) => r.item === "commands");
      expect(commandsResult?.action).toBe("linked");

      const agentCommands = path.join(configDir, "commands");
      expect(lstatSync(agentCommands).isSymbolicLink()).toBe(true);
    });

    it("backs up existing real files before linking", () => {
      const repoFile = path.join(repoDir, "test-agent", "settings.json");
      writeFileSync(repoFile, '{"repo": true}');

      const agentFile = path.join(configDir, "settings.json");
      writeFileSync(agentFile, '{"original": true}');

      const results = linkAgent(makeAgentDef(), repoDir);

      expect(results[0].action).toBe("backed-up-and-linked");

      // Symlink should now exist
      expect(lstatSync(agentFile).isSymbolicLink()).toBe(true);

      // Backup should exist
      const entries = readdirSync(configDir);
      const backups = entries.filter((e) => e.startsWith("settings.json.backup."));
      expect(backups).toHaveLength(1);

      // Backup should contain original content
      const backupContent = readFileSync(path.join(configDir, backups[0]), "utf-8");
      expect(backupContent).toBe('{"original": true}');
    });

    it("skips items already correctly linked (idempotent)", () => {
      const repoFile = path.join(repoDir, "test-agent", "settings.json");
      writeFileSync(repoFile, '{"key": "value"}');

      // First link
      linkAgent(makeAgentDef(), repoDir);
      // Second link — should skip
      const results = linkAgent(makeAgentDef(), repoDir);

      expect(results[0].action).toBe("skipped");
    });

    it("skips items that do not exist in repo", () => {
      // Don't create any files in repo
      const results = linkAgent(makeAgentDef(), repoDir);

      expect(results).toHaveLength(0);
    });
  });

  describe("unlinkAgent", () => {
    it("removes symlinks created by linkAgent", () => {
      const repoFile = path.join(repoDir, "test-agent", "settings.json");
      writeFileSync(repoFile, '{"key": "value"}');

      linkAgent(makeAgentDef(), repoDir);
      const results = unlinkAgent(makeAgentDef(), repoDir);

      expect(results[0].action).toBe("unlinked");
      expect(existsSync(path.join(configDir, "settings.json"))).toBe(false);
    });

    it("restores most recent backup when unlinking", () => {
      const repoFile = path.join(repoDir, "test-agent", "settings.json");
      writeFileSync(repoFile, '{"repo": true}');

      const agentFile = path.join(configDir, "settings.json");
      writeFileSync(agentFile, '{"original": true}');

      // Link (creates backup)
      linkAgent(makeAgentDef(), repoDir);
      // Unlink (should restore backup)
      const results = unlinkAgent(makeAgentDef(), repoDir);

      expect(results[0].action).toBe("restored");
      expect(existsSync(agentFile)).toBe(true);
      expect(lstatSync(agentFile).isSymbolicLink()).toBe(false);
      expect(readFileSync(agentFile, "utf-8")).toBe('{"original": true}');
    });

    it("skips items that are not symlinks to repo", () => {
      const agentFile = path.join(configDir, "settings.json");
      writeFileSync(agentFile, '{"not-a-symlink": true}');

      // Create repo file so portable item is relevant
      writeFileSync(path.join(repoDir, "test-agent", "settings.json"), "{}");

      const results = unlinkAgent(makeAgentDef(), repoDir);
      expect(results[0].action).toBe("skipped");

      // Original file should be untouched
      expect(readFileSync(agentFile, "utf-8")).toBe('{"not-a-symlink": true}');
    });
  });

  describe("linkAgent dryRun", () => {
    it("returns results but does NOT create symlinks on disk", () => {
      const repoFile = path.join(repoDir, "test-agent", "settings.json");
      writeFileSync(repoFile, '{"key": "value"}');

      const results = linkAgent(makeAgentDef(), repoDir, true);

      expect(results).toHaveLength(1);
      expect(results[0].action).toBe("linked");
      expect(results[0].item).toBe("settings.json");

      // Symlink should NOT exist
      const agentFile = path.join(configDir, "settings.json");
      expect(existsSync(agentFile)).toBe(false);
    });

    it("returns backed-up-and-linked but does NOT backup or create symlink", () => {
      const repoFile = path.join(repoDir, "test-agent", "settings.json");
      writeFileSync(repoFile, '{"repo": true}');

      const agentFile = path.join(configDir, "settings.json");
      writeFileSync(agentFile, '{"original": true}');

      const results = linkAgent(makeAgentDef(), repoDir, true);

      expect(results[0].action).toBe("backed-up-and-linked");

      // Original file should still be a regular file, not a symlink
      expect(lstatSync(agentFile).isSymbolicLink()).toBe(false);
      expect(readFileSync(agentFile, "utf-8")).toBe('{"original": true}');

      // No backup should have been created
      const entries = readdirSync(configDir);
      const backups = entries.filter((e) => e.startsWith("settings.json.backup."));
      expect(backups).toHaveLength(0);
    });

    it("returns results for directories without creating symlinks", () => {
      const repoCommandsDir = path.join(repoDir, "test-agent", "commands");
      mkdirSync(repoCommandsDir, { recursive: true });
      writeFileSync(path.join(repoCommandsDir, "run.md"), "# Run");

      const results = linkAgent(makeAgentDef(), repoDir, true);

      const commandsResult = results.find((r) => r.item === "commands");
      expect(commandsResult?.action).toBe("linked");

      // Symlink should NOT exist
      const agentCommands = path.join(configDir, "commands");
      expect(existsSync(agentCommands)).toBe(false);
    });
  });

  describe("unlinkAgent dryRun", () => {
    it("returns results but does NOT remove symlinks", () => {
      const repoFile = path.join(repoDir, "test-agent", "settings.json");
      writeFileSync(repoFile, '{"key": "value"}');

      // Create a real link first
      linkAgent(makeAgentDef(), repoDir);
      const agentFile = path.join(configDir, "settings.json");
      expect(lstatSync(agentFile).isSymbolicLink()).toBe(true);

      // Dry-run unlink
      const results = unlinkAgent(makeAgentDef(), repoDir, true);

      expect(results[0].action).toBe("unlinked");
      expect(results[0].item).toBe("settings.json");

      // Symlink should still exist
      expect(lstatSync(agentFile).isSymbolicLink()).toBe(true);
      expect(readlinkSync(agentFile)).toBe(repoFile);
    });

    it("returns restored but does NOT remove symlink or restore backup", () => {
      const repoFile = path.join(repoDir, "test-agent", "settings.json");
      writeFileSync(repoFile, '{"repo": true}');

      const agentFile = path.join(configDir, "settings.json");
      writeFileSync(agentFile, '{"original": true}');

      // Link (creates backup and symlink)
      linkAgent(makeAgentDef(), repoDir);
      expect(lstatSync(agentFile).isSymbolicLink()).toBe(true);

      // Dry-run unlink
      const results = unlinkAgent(makeAgentDef(), repoDir, true);

      expect(results[0].action).toBe("restored");

      // Symlink should still be in place (not removed)
      expect(lstatSync(agentFile).isSymbolicLink()).toBe(true);

      // Backup file should still exist (not renamed back)
      const entries = readdirSync(configDir);
      const backups = entries.filter((e) => e.startsWith("settings.json.backup."));
      expect(backups).toHaveLength(1);
    });
  });

  describe("getStatus", () => {
    it("returns 'linked' for correctly symlinked items", () => {
      const repoFile = path.join(repoDir, "test-agent", "settings.json");
      writeFileSync(repoFile, "{}");
      linkAgent(makeAgentDef(), repoDir);

      const statuses = getStatus(makeAgentDef(), repoDir);
      const settings = statuses.find((s) => s.item === "settings.json");
      expect(settings?.status).toBe("linked");
    });

    it("returns 'unlinked' when repo file exists but agent path does not", () => {
      writeFileSync(path.join(repoDir, "test-agent", "settings.json"), "{}");

      const statuses = getStatus(makeAgentDef(), repoDir);
      const settings = statuses.find((s) => s.item === "settings.json");
      expect(settings?.status).toBe("unlinked");
    });

    it("returns 'diverged' when agent path is a real file (not symlinked)", () => {
      writeFileSync(path.join(repoDir, "test-agent", "settings.json"), "{}");
      writeFileSync(path.join(configDir, "settings.json"), '{"local": true}');

      const statuses = getStatus(makeAgentDef(), repoDir);
      const settings = statuses.find((s) => s.item === "settings.json");
      expect(settings?.status).toBe("diverged");
    });

    it("returns 'missing' when neither repo nor agent path exists", () => {
      const statuses = getStatus(makeAgentDef(), repoDir);
      const settings = statuses.find((s) => s.item === "settings.json");
      expect(settings?.status).toBe("missing");
    });
  });
});
