import { describe, expect, it } from "vitest";
import { loadAgentById } from "../../core/schema-loader.js";
import type { AgentDefinition } from "../../schemas/agent-schema.js";
import { parseMCPConfigFromString } from "../parser.js";
import { transformForAgent } from "../transformer.js";
import type { NormalizedMCPConfig } from "../types.js";

/** Sample normalized MCP config used across tests */
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

describe("transformForAgent", () => {
  describe("Claude Code", () => {
    it("transforms stdio server with env vars", async () => {
      const agent = await loadAgentById("claude-code");
      const result = transformForAgent(sampleConfig, agent);

      expect(result.rootKey).toBe("mcpServers");
      expect(result.format).toBe("json");
      expect(result.servers.github).toEqual({
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: {
          GITHUB_TOKEN: "${GITHUB_TOKEN}",
        },
      });
    });

    it("transforms http server with bearer header", async () => {
      const agent = await loadAgentById("claude-code");
      const result = transformForAgent(sampleConfig, agent);

      expect(result.servers.sentry).toEqual({
        type: "http",
        url: "https://mcp.sentry.dev/sse",
        headers: {
          Authorization: "Bearer ${SENTRY_TOKEN}",
        },
      });
    });

    it("snapshot: full Claude Code output", async () => {
      const agent = await loadAgentById("claude-code");
      const result = transformForAgent(sampleConfig, agent);
      expect(result).toMatchSnapshot();
    });
  });

  describe("Codex", () => {
    it("transforms stdio server with named env vars", async () => {
      const agent = await loadAgentById("codex");
      const result = transformForAgent(sampleConfig, agent);

      expect(result.rootKey).toBe("mcp_servers");
      expect(result.format).toBe("toml");
      expect(result.servers.github).toEqual({
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env_vars: ["GITHUB_TOKEN"],
      });
    });

    it("transforms http server with bearer_token_env_var", async () => {
      const agent = await loadAgentById("codex");
      const result = transformForAgent(sampleConfig, agent);

      expect(result.servers.sentry).toEqual({
        type: "http",
        url: "https://mcp.sentry.dev/sse",
        bearer_token_env_var: "SENTRY_TOKEN",
      });
    });

    it("snapshot: full Codex output", async () => {
      const agent = await loadAgentById("codex");
      const result = transformForAgent(sampleConfig, agent);
      expect(result).toMatchSnapshot();
    });
  });

  describe("edge cases", () => {
    it("handles server with no env vars", async () => {
      const config: NormalizedMCPConfig = {
        servers: {
          simple: {
            transport: "stdio",
            command: "echo",
            args: ["hello"],
          },
        },
      };
      const agent = await loadAgentById("claude-code");
      const result = transformForAgent(config, agent);

      expect(result.servers.simple).toEqual({
        type: "stdio",
        command: "echo",
        args: ["hello"],
      });
      // No env key present
      expect(result.servers.simple).not.toHaveProperty("env");
    });

    it("handles server with no args", async () => {
      const config: NormalizedMCPConfig = {
        servers: {
          minimal: {
            transport: "stdio",
            command: "my-server",
          },
        },
      };
      const agent = await loadAgentById("claude-code");
      const result = transformForAgent(config, agent);

      expect(result.servers.minimal).toEqual({
        type: "stdio",
        command: "my-server",
      });
      expect(result.servers.minimal).not.toHaveProperty("args");
    });

    it("handles multiple env vars for Codex named style", async () => {
      const config: NormalizedMCPConfig = {
        servers: {
          multi: {
            transport: "stdio",
            command: "my-server",
            env: {
              API_KEY: { $env: "API_KEY" },
              SECRET: { $env: "MY_SECRET" },
            },
          },
        },
      };
      const agent = await loadAgentById("codex");
      const result = transformForAgent(config, agent);

      expect(result.servers.multi.env_vars).toEqual(
        expect.arrayContaining(["API_KEY", "MY_SECRET"]),
      );
    });
  });
});

describe("Phase 2 transformer features", () => {
  /** Mock agent with array command type (like OpenCode) */
  const arrayCommandAgent: AgentDefinition = {
    id: "mock-array",
    name: "Mock Array Agent",
    configDir: { darwin: "~/.mock", linux: "~/.mock", win32: "%APPDATA%/mock" },
    detect: { type: "directory-exists", path: "~/.mock" },
    portable: [],
    ignore: [],
    credentials: [],
    instructions: { filename: "AGENTS.md", globalPath: "~/.mock/AGENTS.md" },
    mcp: {
      configPath: "config.json",
      scope: "user",
      rootKey: "mcp",
      format: "json",
      writeMode: "merge",
      envSyntax: "{env:VAR}",
      transports: {
        stdio: { typeField: "type", typeValue: "local" },
        http: { typeField: "type", typeValue: "remote", urlKey: "url" },
      },
      commandType: "array",
      envKey: "env",
      envVarStyle: "inline",
    },
  };

  /** Mock agent with custom urlKey and no type fields (like Gemini CLI) */
  const implicitTransportAgent: AgentDefinition = {
    id: "mock-implicit",
    name: "Mock Implicit Agent",
    configDir: { darwin: "~/.mock2", linux: "~/.mock2", win32: "%APPDATA%/mock2" },
    detect: { type: "directory-exists", path: "~/.mock2" },
    portable: [],
    ignore: [],
    credentials: [],
    instructions: { filename: "GEMINI.md", globalPath: "~/.mock2/GEMINI.md" },
    mcp: {
      configPath: "settings.json",
      scope: "user",
      rootKey: "mcpServers",
      format: "json",
      writeMode: "merge",
      envSyntax: "${VAR}",
      transports: {
        stdio: {},
        http: { urlKey: "httpUrl" },
      },
      commandType: "string",
      envKey: "env",
      envVarStyle: "inline",
    },
  };

  describe("array command output", () => {
    it("combines command and args into a single array", () => {
      const result = transformForAgent(sampleConfig, arrayCommandAgent);

      expect(result.servers.github.command).toEqual([
        "npx",
        "-y",
        "@modelcontextprotocol/server-github",
      ]);
      // No separate args field when commandType is 'array'
      expect(result.servers.github).not.toHaveProperty("args");
    });

    it("outputs single-element array when no args", () => {
      const config: NormalizedMCPConfig = {
        servers: {
          simple: {
            transport: "stdio",
            command: "my-server",
          },
        },
      };
      const result = transformForAgent(config, arrayCommandAgent);

      expect(result.servers.simple.command).toEqual(["my-server"]);
      expect(result.servers.simple).not.toHaveProperty("args");
    });

    it("uses agent-specific env syntax with array commands", () => {
      const result = transformForAgent(sampleConfig, arrayCommandAgent);

      expect(result.servers.github.env).toEqual({
        GITHUB_TOKEN: "{env:GITHUB_TOKEN}",
      });
    });

    it("uses agent-specific transport type values", () => {
      const result = transformForAgent(sampleConfig, arrayCommandAgent);

      expect(result.servers.github.type).toBe("local");
      expect(result.servers.sentry.type).toBe("remote");
    });
  });

  describe("custom urlKey", () => {
    it("uses httpUrl instead of url for HTTP servers", () => {
      const result = transformForAgent(sampleConfig, implicitTransportAgent);

      expect(result.servers.sentry.httpUrl).toBe("https://mcp.sentry.dev/sse");
      expect(result.servers.sentry).not.toHaveProperty("url");
    });
  });

  describe("omitted type field", () => {
    it("skips type field when transport has no typeField defined", () => {
      const result = transformForAgent(sampleConfig, implicitTransportAgent);

      // stdio transport has no typeField → no type key
      expect(result.servers.github).not.toHaveProperty("type");
      // http transport also has no typeField → no type key
      expect(result.servers.sentry).not.toHaveProperty("type");
    });

    it("still outputs command and env for stdio without type", () => {
      const result = transformForAgent(sampleConfig, implicitTransportAgent);

      expect(result.servers.github).toEqual({
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: {
          GITHUB_TOKEN: "${GITHUB_TOKEN}",
        },
      });
    });
  });
});

describe("parseMCPConfigFromString", () => {
  it("parses valid mcp.json", () => {
    const input = JSON.stringify(sampleConfig);
    const result = parseMCPConfigFromString(input);
    expect(result.servers.github.transport).toBe("stdio");
    expect(result.servers.sentry.transport).toBe("http");
  });

  it("rejects missing servers key", () => {
    expect(() => parseMCPConfigFromString("{}")).toThrow("servers");
  });

  it("rejects stdio server without command", () => {
    const bad = JSON.stringify({
      servers: { test: { transport: "stdio" } },
    });
    expect(() => parseMCPConfigFromString(bad)).toThrow("command");
  });

  it("rejects http server without url", () => {
    const bad = JSON.stringify({
      servers: { test: { transport: "http" } },
    });
    expect(() => parseMCPConfigFromString(bad)).toThrow("url");
  });

  it("rejects invalid transport", () => {
    const bad = JSON.stringify({
      servers: { test: { transport: "grpc" } },
    });
    expect(() => parseMCPConfigFromString(bad)).toThrow("invalid transport");
  });

  it("rejects env var without $env", () => {
    const bad = JSON.stringify({
      servers: {
        test: {
          transport: "stdio",
          command: "echo",
          env: { KEY: { value: "literal" } },
        },
      },
    });
    expect(() => parseMCPConfigFromString(bad)).toThrow("$env");
  });
});
