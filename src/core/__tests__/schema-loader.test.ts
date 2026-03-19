import { describe, it, expect } from "vitest";
import {
  loadAllAgentDefinitions,
  loadAgentDefinition,
  loadAgentById,
} from "../schema-loader.js";
import path from "node:path";

const agentsDir = path.resolve(__dirname, "../../../agents");

describe("schema-loader", () => {
  describe("loadAllAgentDefinitions", () => {
    it("loads all agent definitions from the agents/ directory", () => {
      const agents = loadAllAgentDefinitions();
      expect(agents.length).toBe(6);

      const ids = agents.map((a) => a.id);
      expect(ids).toContain("claude-code");
      expect(ids).toContain("codex");
      expect(ids).toContain("opencode");
      expect(ids).toContain("gemini-cli");
      expect(ids).toContain("cursor");
      expect(ids).toContain("windsurf");
    });
  });

  describe("loadAgentDefinition", () => {
    it("loads claude-code.json with all required fields", () => {
      const claude = loadAgentDefinition(
        path.join(agentsDir, "claude-code.json"),
      );

      expect(claude.id).toBe("claude-code");
      expect(claude.name).toBe("Claude Code");
      expect(claude.configDir.darwin).toBe("~/.claude");
      expect(claude.configDir.linux).toBe("~/.claude");
      expect(claude.configDir.win32).toBe("%APPDATA%/claude");
      expect(claude.detect.type).toBe("directory-exists");
      expect(claude.detect.path).toBe("~/.claude");
      expect(claude.portable).toContain("settings.json");
      expect(claude.portable).toContain("CLAUDE.md");
      expect(claude.ignore).toContain("history.jsonl");
      expect(claude.credentials).toContain("~/.claude.json");
      expect(claude.instructions.filename).toBe("CLAUDE.md");
      expect(claude.instructions.globalPath).toBe("~/.claude/CLAUDE.md");
      expect(claude.mcp.configPath).toBe(".mcp.json");
      expect(claude.mcp.rootKey).toBe("mcpServers");
      expect(claude.mcp.envSyntax).toBe("${VAR}");
      expect(claude.mcp.commandType).toBe("string");
      expect(claude.mcp.envKey).toBe("env");
      expect(claude.mcp.transports.stdio).toBeDefined();
      expect(claude.mcp.transports.http).toBeDefined();
    });

    it("loads codex.json with all required fields", () => {
      const codex = loadAgentDefinition(
        path.join(agentsDir, "codex.json"),
      );

      expect(codex.id).toBe("codex");
      expect(codex.name).toBe("Codex CLI");
      expect(codex.configDir.darwin).toBe("~/.codex");
      expect(codex.detect.type).toBe("directory-exists");
      expect(codex.detect.path).toBe("~/.codex");
      expect(codex.portable).toContain("config.toml");
      expect(codex.portable).toContain("AGENTS.md");
      expect(codex.instructions.filename).toBe("AGENTS.md");
      expect(codex.mcp.configPath).toBe("config.toml");
      expect(codex.mcp.rootKey).toBe("mcp_servers");
      expect(codex.mcp.format).toBe("toml");
      expect(codex.mcp.envSyntax).toBe("env_vars");
      expect(codex.mcp.envKey).toBe("env_vars");
    });

    it("throws on invalid JSON file", () => {
      expect(() =>
        loadAgentDefinition("/nonexistent/path/fake.json"),
      ).toThrow();
    });
  });

  describe("loadAgentById", () => {
    it("returns the correct agent by ID", () => {
      const claude = loadAgentById("claude-code");
      expect(claude).toBeDefined();
      expect(claude!.id).toBe("claude-code");
      expect(claude!.name).toBe("Claude Code");
    });

    it("returns undefined for unknown agent ID", () => {
      const unknown = loadAgentById("nonexistent-agent");
      expect(unknown).toBeUndefined();
    });
  });
});
