import { describe, it, expect } from "vitest";
import {
  loadAllAgentDefinitions,
  loadAgentDefinition,
  loadAgentById,
  validateAgainstSchema,
} from "../schema-loader.js";
import path from "node:path";

const agentsDir = path.resolve(__dirname, "../../../agents");

describe("schema-loader", () => {
  describe("loadAllAgentDefinitions", () => {
    it("loads all agent definitions from the agents/ directory", () => {
      const agents = loadAllAgentDefinitions();
      expect(agents.length).toBe(10);

      const ids = agents.map((a) => a.id);
      expect(ids).toContain("claude-code");
      expect(ids).toContain("codex");
      expect(ids).toContain("opencode");
      expect(ids).toContain("gemini-cli");
      expect(ids).toContain("cursor");
      expect(ids).toContain("windsurf");
      expect(ids).toContain("github-copilot");
      expect(ids).toContain("amazon-q");
      expect(ids).toContain("kiro");
      expect(ids).toContain("antigravity");
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

  describe("validateAgainstSchema", () => {
    /** A minimal valid agent definition for use as a test fixture. */
    function validDefinition(): Record<string, unknown> {
      return {
        id: "test-agent",
        name: "Test Agent",
        configDir: {
          darwin: "~/.test-agent",
          linux: "~/.test-agent",
          win32: "%APPDATA%/test-agent",
        },
        detect: {
          type: "directory-exists",
          path: "~/.test-agent",
        },
        portable: ["config.json"],
        ignore: ["cache/**"],
        credentials: [],
        instructions: {
          filename: "AGENTS.md",
          globalPath: "~/.test-agent/AGENTS.md",
        },
        mcp: {
          configPath: "mcp.json",
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
      };
    }

    it("accepts a valid agent definition", () => {
      const result = validateAgainstSchema(validDefinition());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("all 10 bundled agent definitions pass validation", () => {
      const agents = loadAllAgentDefinitions();
      expect(agents.length).toBe(10);
      for (const agent of agents) {
        const result = validateAgainstSchema(agent);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }
    });

    it("rejects a definition missing top-level required field 'id'", () => {
      const def = validDefinition();
      delete def.id;
      const result = validateAgainstSchema(def);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('"id"'))).toBe(true);
    });

    it("rejects a definition missing top-level required field 'mcp'", () => {
      const def = validDefinition();
      delete def.mcp;
      const result = validateAgainstSchema(def);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('"mcp"'))).toBe(true);
    });

    it("rejects a definition missing top-level required field 'instructions'", () => {
      const def = validDefinition();
      delete def.instructions;
      const result = validateAgainstSchema(def);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('"instructions"'))).toBe(true);
    });

    it("rejects a definition with writeMode set to an invalid value", () => {
      const def = validDefinition();
      (def.mcp as Record<string, unknown>).writeMode = "invalid";
      const result = validateAgainstSchema(def);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.path.includes("writeMode") && e.message.includes("invalid"),
        ),
      ).toBe(true);
    });

    it("rejects a definition with commandType set to an invalid value", () => {
      const def = validDefinition();
      (def.mcp as Record<string, unknown>).commandType = "list";
      const result = validateAgainstSchema(def);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.path.includes("commandType") && e.message.includes("list"),
        ),
      ).toBe(true);
    });

    it("rejects a definition with scope set to an invalid value", () => {
      const def = validDefinition();
      (def.mcp as Record<string, unknown>).scope = "global";
      const result = validateAgainstSchema(def);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.path.includes("scope") && e.message.includes("global"),
        ),
      ).toBe(true);
    });

    it("rejects a definition with envVarStyle set to an invalid value", () => {
      const def = validDefinition();
      (def.mcp as Record<string, unknown>).envVarStyle = "block";
      const result = validateAgainstSchema(def);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.path.includes("envVarStyle") && e.message.includes("block"),
        ),
      ).toBe(true);
    });

    it("rejects a definition with detect.type set to an invalid value", () => {
      const def = validDefinition();
      (def.detect as Record<string, unknown>).type = "file-exists";
      const result = validateAgainstSchema(def);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.path.includes("detect") && e.message.includes("file-exists"),
        ),
      ).toBe(true);
    });

    it("rejects a definition missing 'transports' in mcp", () => {
      const def = validDefinition();
      delete (def.mcp as Record<string, unknown>).transports;
      const result = validateAgainstSchema(def);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.message.includes('"transports"')),
      ).toBe(true);
    });

    it("rejects a definition missing 'envKey' in mcp", () => {
      const def = validDefinition();
      delete (def.mcp as Record<string, unknown>).envKey;
      const result = validateAgainstSchema(def);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.message.includes('"envKey"')),
      ).toBe(true);
    });

    it("rejects a definition where 'id' is a number instead of string", () => {
      const def = validDefinition();
      def.id = 42;
      const result = validateAgainstSchema(def);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.path === "id" && e.message.includes("string"),
        ),
      ).toBe(true);
    });

    it("rejects a definition where 'portable' is a string instead of array", () => {
      const def = validDefinition();
      def.portable = "config.json";
      const result = validateAgainstSchema(def);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.path === "portable" && e.message.includes("array"),
        ),
      ).toBe(true);
    });

    it("rejects a definition missing required platform paths in configDir", () => {
      const def = validDefinition();
      def.configDir = { darwin: "~/.test" };
      const result = validateAgainstSchema(def);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.message.includes('"linux"')),
      ).toBe(true);
      expect(
        result.errors.some((e) => e.message.includes('"win32"')),
      ).toBe(true);
    });

    it("rejects an extra top-level property", () => {
      const def = validDefinition() as Record<string, unknown>;
      def.extraField = "not allowed";
      const result = validateAgainstSchema(def);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.path === "extraField" && e.message.includes("not allowed"),
        ),
      ).toBe(true);
    });

    it("rejects an extra property inside mcp", () => {
      const def = validDefinition();
      (def.mcp as Record<string, unknown>).unknownKey = "bad";
      const result = validateAgainstSchema(def);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.path === "mcp.unknownKey" &&
            e.message.includes("not allowed"),
        ),
      ).toBe(true);
    });

    it("rejects an extra property inside configDir", () => {
      const def = validDefinition();
      (def.configDir as Record<string, unknown>).freebsd = "~/.test-agent";
      const result = validateAgainstSchema(def);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.path === "configDir.freebsd" &&
            e.message.includes("not allowed"),
        ),
      ).toBe(true);
    });
  });
});
