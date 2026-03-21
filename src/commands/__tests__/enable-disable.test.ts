import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableCommand } from "../enable.js";
import { disableCommand } from "../disable.js";

let tmpDir: string;
let logs: string[];
let errorLogs: string[];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "enable-disable-test-"));
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

function writeManifest(agents: Record<string, { enabled: boolean; name: string }>): void {
  fs.writeFileSync(
    path.join(tmpDir, "agents-anywhere.json"),
    JSON.stringify({ version: "0.1.0", agents }),
  );
}

function readManifest(): { version: string; agents: Record<string, { enabled: boolean; name: string }> } {
  return JSON.parse(fs.readFileSync(path.join(tmpDir, "agents-anywhere.json"), "utf-8"));
}

describe("enableCommand", () => {
  it("enables a disabled agent", async () => {
    writeManifest({ "claude-code": { enabled: false, name: "Claude Code" } });
    await enableCommand("claude-code");
    const m = readManifest();
    expect(m.agents["claude-code"].enabled).toBe(true);
    expect(logs.join("\n")).toContain("Enabled");
  });

  it("reports already enabled", async () => {
    writeManifest({ "claude-code": { enabled: true, name: "Claude Code" } });
    await enableCommand("claude-code");
    expect(logs.join("\n")).toContain("already enabled");
  });

  it("adds agent not in manifest", async () => {
    writeManifest({});
    await enableCommand("claude-code");
    const m = readManifest();
    expect(m.agents["claude-code"].enabled).toBe(true);
    expect(logs.join("\n")).toContain("added to manifest");
  });

  it("rejects unknown agent", async () => {
    writeManifest({});
    await enableCommand("nonexistent-agent");
    expect(errorLogs.join("\n")).toContain("Unknown agent");
  });
});

describe("disableCommand", () => {
  it("disables an enabled agent", async () => {
    writeManifest({ "claude-code": { enabled: true, name: "Claude Code" } });
    await disableCommand("claude-code");
    const m = readManifest();
    expect(m.agents["claude-code"].enabled).toBe(false);
    expect(logs.join("\n")).toContain("Disabled");
  });

  it("reports already disabled", async () => {
    writeManifest({ "claude-code": { enabled: false, name: "Claude Code" } });
    await disableCommand("claude-code");
    expect(logs.join("\n")).toContain("already disabled");
  });

  it("rejects agent not in manifest", async () => {
    writeManifest({});
    await disableCommand("claude-code");
    expect(errorLogs.join("\n")).toContain("not in the manifest");
  });

  it("rejects unknown agent", async () => {
    writeManifest({});
    await disableCommand("nonexistent-agent");
    expect(errorLogs.join("\n")).toContain("Unknown agent");
  });
});
