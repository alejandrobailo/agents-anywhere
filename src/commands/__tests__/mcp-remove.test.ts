import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mcpRemoveCommand } from "../mcp-remove.js";

let tmpDir: string;
let logs: string[];
let errorLogs: string[];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-remove-test-"));
  logs = [];
  errorLogs = [];

  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errorLogs.push(args.map(String).join(" "));
  });
  vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function writeManifest(): void {
  fs.writeFileSync(
    path.join(tmpDir, "agents-anywhere.json"),
    JSON.stringify({
      version: "0.1.0",
      agents: { "claude-code": { enabled: true, name: "Claude Code" } },
    }),
  );
}

function writeMCP(servers: Record<string, unknown>): void {
  fs.writeFileSync(
    path.join(tmpDir, "mcp.json"),
    JSON.stringify({ servers }),
  );
}

function readMCP(): { servers: Record<string, unknown> } {
  return JSON.parse(fs.readFileSync(path.join(tmpDir, "mcp.json"), "utf-8"));
}

describe("mcpRemoveCommand", () => {
  it("removes an existing server", async () => {
    writeManifest();
    writeMCP({
      github: { transport: "stdio", command: "npx", args: ["-y", "@mcp/github"] },
      sentry: { transport: "http", url: "https://mcp.sentry.dev" },
    });
    await mcpRemoveCommand("github");
    const config = readMCP();
    expect(config.servers.github).toBeUndefined();
    expect(config.servers.sentry).toBeDefined();
    expect(logs.join("\n")).toContain("Removed");
  });

  it("warns when server not found", async () => {
    writeManifest();
    writeMCP({ github: { transport: "stdio", command: "npx" } });
    await mcpRemoveCommand("nonexistent");
    expect(logs.join("\n")).toContain("not found");
  });

  it("preserves other servers", async () => {
    writeManifest();
    writeMCP({
      a: { transport: "stdio", command: "a" },
      b: { transport: "stdio", command: "b" },
      c: { transport: "stdio", command: "c" },
    });
    await mcpRemoveCommand("b");
    const config = readMCP();
    expect(Object.keys(config.servers)).toEqual(["a", "c"]);
  });

  it("shows error for invalid mcp.json", async () => {
    writeManifest();
    fs.writeFileSync(path.join(tmpDir, "mcp.json"), "not json{{{");
    await mcpRemoveCommand("github");
    expect(errorLogs.join("\n")).toContain("Failed to parse");
  });
});
