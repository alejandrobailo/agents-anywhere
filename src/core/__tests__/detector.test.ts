import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { detectAgents, detectSingleAgent } from "../detector.js";
import type { AgentDefinition } from "../../schemas/agent-schema.js";

// Mock fs.existsSync
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn((p: string) => {
      // Delegate to real existsSync for agent JSON files (schema-loader needs it)
      if (typeof p === "string" && p.endsWith(".json")) {
        return actual.existsSync(p);
      }
      // For detection paths, use our mock map
      return mockExistingPaths.has(p as string);
    }),
  };
});

// We also need readFileSync and readdirSync to work for schema-loader
// The spread above handles that since we only override existsSync

const mockExistingPaths = new Set<string>();

beforeEach(() => {
  mockExistingPaths.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeAgentDef(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
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
    instructions: { filename: "AGENTS.md", globalPath: "~/.test-agent/AGENTS.md" },
    mcp: {
      configPath: "mcp.json",
      scope: "user",
      rootKey: "mcpServers",
      envSyntax: "${VAR}",
      transports: {
        stdio: { typeField: "type", typeValue: "stdio" },
      },
      commandType: "string",
      envKey: "env",
    },
    ...overrides,
  };
}

describe("detector", () => {
  describe("detectSingleAgent", () => {
    it("returns installed: true when detect directory exists", () => {
      const home = process.env.HOME ?? "/home/user";
      mockExistingPaths.add(`${home}/.test-agent`);

      const result = detectSingleAgent(makeAgentDef());
      expect(result.installed).toBe(true);
      expect(result.configDir).toBe(`${home}/.test-agent`);
      expect(result.definition.id).toBe("test-agent");
    });

    it("returns installed: false when detect directory does not exist", () => {
      const result = detectSingleAgent(makeAgentDef());
      expect(result.installed).toBe(false);
    });

    it("expands ~ in configDir path", () => {
      const home = process.env.HOME ?? "/home/user";
      const result = detectSingleAgent(makeAgentDef());
      expect(result.configDir).toBe(`${home}/.test-agent`);
    });

    it("handles platform-specific configDir", () => {
      const home = process.env.HOME ?? "/home/user";
      const def = makeAgentDef({
        configDir: {
          darwin: "~/.darwin-agent",
          linux: "~/.linux-agent",
          win32: "%APPDATA%/win-agent",
        },
      });

      const result = detectSingleAgent(def);
      const platform = process.platform;
      if (platform === "darwin") {
        expect(result.configDir).toBe(`${home}/.darwin-agent`);
      } else if (platform === "linux") {
        expect(result.configDir).toBe(`${home}/.linux-agent`);
      }
    });
  });

  describe("detectAgents", () => {
    it("returns a DetectedAgent for each known agent definition", () => {
      const results = detectAgents();
      expect(results.length).toBeGreaterThanOrEqual(2);

      const ids = results.map((r) => r.definition.id);
      expect(ids).toContain("claude-code");
      expect(ids).toContain("codex");
    });

    it("each result has configDir, installed, and definition", () => {
      const results = detectAgents();
      for (const result of results) {
        expect(result).toHaveProperty("configDir");
        expect(result).toHaveProperty("installed");
        expect(result).toHaveProperty("definition");
        expect(typeof result.configDir).toBe("string");
        expect(typeof result.installed).toBe("boolean");
        expect(result.definition.id).toBeTruthy();
      }
    });

    it("detects installed agents when their directories exist", () => {
      const home = process.env.HOME ?? "/home/user";
      mockExistingPaths.add(`${home}/.claude`);

      const results = detectAgents();
      const claude = results.find((r) => r.definition.id === "claude-code");
      const codex = results.find((r) => r.definition.id === "codex");

      expect(claude?.installed).toBe(true);
      expect(codex?.installed).toBe(false);
    });
  });
});
