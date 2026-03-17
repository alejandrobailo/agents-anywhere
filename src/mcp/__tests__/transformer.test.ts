import { describe, expect, it } from "vitest";
import { loadAgentById } from "../../core/schema-loader.js";
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
