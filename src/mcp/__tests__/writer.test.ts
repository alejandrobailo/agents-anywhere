import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mergeJSON, writeJSON, writeTOML } from "../writer.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(import.meta.dirname ?? __dirname, ".tmp-writer-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("writeJSON", () => {
  it("writes a standalone JSON file with rootKey wrapping servers", () => {
    const filePath = path.join(tmpDir, ".mcp.json");
    const servers = {
      github: {
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" },
      },
    };

    writeJSON(filePath, "mcpServers", servers);

    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(content).toEqual({ mcpServers: servers });
  });

  it("overwrites existing file completely", () => {
    const filePath = path.join(tmpDir, ".mcp.json");
    fs.writeFileSync(filePath, JSON.stringify({ mcpServers: { old: {} } }));

    const newServers = { fresh: { type: "stdio", command: "echo" } };
    writeJSON(filePath, "mcpServers", newServers);

    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(content).toEqual({ mcpServers: newServers });
    expect(content.mcpServers).not.toHaveProperty("old");
  });

  it("creates parent directories if they don't exist", () => {
    const filePath = path.join(tmpDir, "nested", "dir", ".mcp.json");

    writeJSON(filePath, "mcpServers", {});

    expect(fs.existsSync(filePath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(content).toEqual({ mcpServers: {} });
  });
});

describe("mergeJSON", () => {
  it("merges MCP key into existing JSON file preserving other keys", () => {
    const filePath = path.join(tmpDir, "settings.json");
    fs.writeFileSync(
      filePath,
      JSON.stringify({ theme: "dark", fontSize: 14 }, null, 2),
    );

    const servers = {
      github: { type: "stdio", command: "npx" },
    };

    mergeJSON(filePath, "mcpServers", servers);

    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(content.theme).toBe("dark");
    expect(content.fontSize).toBe(14);
    expect(content.mcpServers).toEqual(servers);
  });

  it("replaces existing MCP key while preserving other keys", () => {
    const filePath = path.join(tmpDir, "settings.json");
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        language: "en",
        mcpServers: { old: { type: "stdio", command: "old-cmd" } },
      }),
    );

    const newServers = {
      github: { type: "stdio", command: "npx" },
    };

    mergeJSON(filePath, "mcpServers", newServers);

    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(content.language).toBe("en");
    expect(content.mcpServers).toEqual(newServers);
    expect(content.mcpServers).not.toHaveProperty("old");
  });

  it("creates file if it doesn't exist", () => {
    const filePath = path.join(tmpDir, "new-file.json");
    const servers = { test: { type: "http", url: "http://localhost:3000" } };

    mergeJSON(filePath, "mcp", servers);

    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(content).toEqual({ mcp: servers });
  });

  it("creates parent directories if needed", () => {
    const filePath = path.join(tmpDir, "deep", "path", "config.json");
    mergeJSON(filePath, "mcpServers", {});
    expect(fs.existsSync(filePath)).toBe(true);
  });
});

describe("writeTOML", () => {
  it("writes MCP servers to a new TOML file", () => {
    const filePath = path.join(tmpDir, "config.toml");
    const servers = {
      github: {
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env_vars: ["GITHUB_TOKEN"],
      },
    };

    writeTOML(filePath, servers);

    const raw = fs.readFileSync(filePath, "utf-8");
    expect(raw).toContain("[mcp_servers.github]");
    expect(raw).toContain('command = "npx"');
    expect(raw).toContain('"GITHUB_TOKEN"');
  });

  it("merges into existing TOML file preserving other sections", () => {
    const filePath = path.join(tmpDir, "config.toml");
    const existingContent = [
      'model = "o4-mini"',
      "temperature = 0.7",
      "",
      "[history]",
      "max_entries = 100",
      "",
    ].join("\n");
    fs.writeFileSync(filePath, existingContent);

    const servers = {
      sentry: {
        type: "http",
        url: "https://mcp.sentry.dev/sse",
        bearer_token_env_var: "SENTRY_TOKEN",
      },
    };

    writeTOML(filePath, servers);

    const raw = fs.readFileSync(filePath, "utf-8");
    // Existing keys preserved
    expect(raw).toContain('model = "o4-mini"');
    expect(raw).toContain("temperature = 0.7");
    expect(raw).toContain("[history]");
    expect(raw).toContain("max_entries = 100");
    // MCP servers added
    expect(raw).toContain("[mcp_servers.sentry]");
    expect(raw).toContain('url = "https://mcp.sentry.dev/sse"');
    expect(raw).toContain('bearer_token_env_var = "SENTRY_TOKEN"');
  });

  it("replaces existing mcp_servers section without affecting other keys", () => {
    const filePath = path.join(tmpDir, "config.toml");
    const existingContent = [
      'model = "o4-mini"',
      "",
      "[mcp_servers.old_server]",
      'type = "stdio"',
      'command = "old-cmd"',
      "",
    ].join("\n");
    fs.writeFileSync(filePath, existingContent);

    const newServers = {
      github: { type: "stdio", command: "npx", env_vars: ["GITHUB_TOKEN"] },
    };

    writeTOML(filePath, newServers);

    const raw = fs.readFileSync(filePath, "utf-8");
    expect(raw).toContain('model = "o4-mini"');
    expect(raw).toContain("[mcp_servers.github]");
    expect(raw).not.toContain("old_server");
    expect(raw).not.toContain("old-cmd");
  });

  it("creates parent directories if needed", () => {
    const filePath = path.join(tmpDir, "nested", "config.toml");
    writeTOML(filePath, {});
    expect(fs.existsSync(filePath)).toBe(true);
  });
});
