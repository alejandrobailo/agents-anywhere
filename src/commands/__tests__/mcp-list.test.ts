import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mcpListCommand } from "../mcp-list.js";

let tmpDir: string;
let logs: string[];
let errorLogs: string[];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-list-test-"));
  logs = [];
  errorLogs = [];

  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errorLogs.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/** Write a minimal agentsync.json manifest to the temp dir */
function writeManifest(): void {
  fs.writeFileSync(
    path.join(tmpDir, "agentsync.json"),
    JSON.stringify({
      version: "0.4.0",
      agents: {
        "claude-code": { enabled: true, name: "Claude Code" },
      },
    }),
  );
}

describe("mcpListCommand", () => {
  it("lists servers with transport, command, and env vars", async () => {
    writeManifest();
    fs.writeFileSync(
      path.join(tmpDir, "mcp.json"),
      JSON.stringify({
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
      }),
    );

    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    await mcpListCommand();

    const output = logs.join("\n");
    expect(output).toContain("MCP Servers (2)");
    expect(output).toContain("github");
    expect(output).toContain("sentry");
    expect(output).toContain("stdio");
    expect(output).toContain("http");
    expect(output).toContain("npx");
    expect(output).toContain("GITHUB_TOKEN");
    expect(output).toContain("SENTRY_TOKEN");
  });

  it("warns when no servers are configured", async () => {
    writeManifest();
    fs.writeFileSync(
      path.join(tmpDir, "mcp.json"),
      JSON.stringify({ servers: {} }),
    );

    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    await mcpListCommand();

    const output = logs.join("\n");
    expect(output).toContain("No MCP servers configured");
  });

  it("shows error when mcp.json is invalid", async () => {
    writeManifest();
    fs.writeFileSync(path.join(tmpDir, "mcp.json"), "not valid json{{{");

    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    await mcpListCommand();

    const output = errorLogs.join("\n");
    expect(output).toContain("Failed to parse mcp.json");
  });

  it("shows http server url correctly", async () => {
    writeManifest();
    fs.writeFileSync(
      path.join(tmpDir, "mcp.json"),
      JSON.stringify({
        servers: {
          "my-api": {
            transport: "http",
            url: "https://api.example.com/mcp",
          },
        },
      }),
    );

    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    await mcpListCommand();

    const output = logs.join("\n");
    expect(output).toContain("MCP Servers (1)");
    expect(output).toContain("my-api");
    expect(output).toContain("https://api.example.com/mcp");
  });
});
