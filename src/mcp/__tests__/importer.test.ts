import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadAgentById } from "../../core/schema-loader.js";
import { transformForAgent } from "../transformer.js";
import {
  importFromAgent,
  importAndMergeAll,
  extractEnvVarName,
  reverseEnvRef,
} from "../importer.js";
import type { NormalizedMCPConfig } from "../types.js";
import type { AgentDefinition } from "../../schemas/agent-schema.js";

describe("extractEnvVarName", () => {
  it("extracts from ${VAR} syntax", () => {
    expect(extractEnvVarName("${GITHUB_TOKEN}", "${VAR}")).toBe("GITHUB_TOKEN");
  });

  it("extracts from ${env:VAR} syntax", () => {
    expect(extractEnvVarName("${env:TOKEN}", "${env:VAR}")).toBe("TOKEN");
  });

  it("extracts from {env:VAR} syntax", () => {
    expect(extractEnvVarName("{env:API_KEY}", "{env:VAR}")).toBe("API_KEY");
  });

  it("returns null for non-matching value", () => {
    expect(extractEnvVarName("literal-value", "${VAR}")).toBeNull();
  });

  it("returns null for empty var name", () => {
    expect(extractEnvVarName("${}", "${VAR}")).toBeNull();
  });
});

describe("reverseEnvRef", () => {
  it("extracts simple env ref", () => {
    const ref = reverseEnvRef("${GITHUB_TOKEN}", "${VAR}");
    expect(ref).toEqual({ $env: "GITHUB_TOKEN" });
  });

  it("extracts env ref with Bearer prefix", () => {
    const ref = reverseEnvRef("Bearer ${SENTRY_TOKEN}", "${VAR}");
    expect(ref).toEqual({ $env: "SENTRY_TOKEN", prefix: "Bearer " });
  });

  it("extracts env ref with ${env:VAR} syntax and prefix", () => {
    const ref = reverseEnvRef("Bearer ${env:TOKEN}", "${env:VAR}");
    expect(ref).toEqual({ $env: "TOKEN", prefix: "Bearer " });
  });

  it("returns null for literal value", () => {
    expect(reverseEnvRef("just-a-string", "${VAR}")).toBeNull();
  });
});

describe("round-trip: transform → reverse-import", () => {
  const sampleConfig: NormalizedMCPConfig = {
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

  async function roundTrip(agentId: string): Promise<void> {
    const agent = await loadAgentById(agentId);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `rt-${agentId}-`));

    try {
      // Forward transform
      const transformed = transformForAgent(sampleConfig, agent);

      // Write native config
      const configDir = tmpDir;
      const configPath = path.join(configDir, agent.mcp.configPath);
      fs.mkdirSync(path.dirname(configPath), { recursive: true });

      const nativeContent: Record<string, unknown> = {
        [transformed.rootKey]: transformed.servers,
      };
      fs.writeFileSync(
        configPath,
        JSON.stringify(nativeContent, null, 2),
        "utf-8",
      );

      // Create a modified agent def pointing to our temp dir
      const modifiedAgent: AgentDefinition = {
        ...agent,
        configDir: { darwin: tmpDir, linux: tmpDir, win32: tmpDir },
      };

      // Reverse import
      const result = importFromAgent(modifiedAgent);
      expect(result).not.toBeNull();
      expect(result!.servers.github).toBeDefined();
      expect(result!.servers.github.transport).toBe("stdio");
      expect(result!.servers.github.command).toBe("npx");
      expect(result!.servers.github.args).toEqual([
        "-y",
        "@modelcontextprotocol/server-github",
      ]);
      expect(result!.servers.github.env?.GITHUB_TOKEN).toEqual({
        $env: "GITHUB_TOKEN",
      });

      // HTTP server
      expect(result!.servers.sentry).toBeDefined();
      expect(result!.servers.sentry.transport).toBe("http");
      expect(result!.servers.sentry.url).toBe("https://mcp.sentry.dev/sse");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  it("round-trips through Claude Code", async () => {
    await roundTrip("claude-code");
  });

  it("round-trips through Cursor", async () => {
    await roundTrip("cursor");
  });

  it("round-trips through GitHub Copilot", async () => {
    await roundTrip("github-copilot");
  });

  it("round-trips through Amazon Q", async () => {
    await roundTrip("amazon-q");
  });
});

describe("importAndMergeAll", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "merge-test-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function makeAgent(
    id: string,
    servers: Record<string, unknown>,
  ): AgentDefinition {
    const configDir = path.join(tmpDir, id);
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "mcp.json"),
      JSON.stringify({ mcpServers: servers }, null, 2),
    );

    return {
      id,
      name: id,
      configDir: { darwin: configDir, linux: configDir, win32: configDir },
      detect: { type: "directory-exists", path: configDir },
      portable: [],
      ignore: [],
      credentials: [],
      instructions: {
        filename: "AGENTS.md",
        globalPath: `${configDir}/AGENTS.md`,
        globalSupport: true,
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

  it("merges servers from multiple agents", () => {
    const a = makeAgent("agent-a", {
      github: { type: "stdio", command: "npx", args: ["-y", "gh-mcp"] },
    });
    const b = makeAgent("agent-b", {
      sentry: { type: "http", url: "https://mcp.sentry.dev" },
    });

    const result = importAndMergeAll([a, b]);
    expect(Object.keys(result.config.servers)).toEqual(["github", "sentry"]);
    expect(result.sources.github).toBe("agent-a");
    expect(result.sources.sentry).toBe("agent-b");
    expect(result.conflicts).toHaveLength(0);
  });

  it("resolves duplicates by keeping richer config", () => {
    const a = makeAgent("agent-a", {
      github: { type: "stdio", command: "npx" },
    });
    const b = makeAgent("agent-b", {
      github: {
        type: "stdio",
        command: "npx",
        args: ["-y", "gh-mcp"],
        env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" },
      },
    });

    const result = importAndMergeAll([a, b]);
    expect(result.sources.github).toBe("agent-b");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].kept).toBe("agent-b");
  });

  it("returns empty config when no agents have MCP configs", () => {
    const a: AgentDefinition = {
      ...makeAgent("agent-a", {}),
    };
    // Override to point to non-existent file
    const configDir = path.join(tmpDir, "empty");
    fs.mkdirSync(configDir, { recursive: true });
    a.configDir = { darwin: configDir, linux: configDir, win32: configDir };

    const result = importAndMergeAll([a]);
    expect(Object.keys(result.config.servers)).toHaveLength(0);
  });
});
