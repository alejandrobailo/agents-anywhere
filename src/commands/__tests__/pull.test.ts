import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";
import { simpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pullCommand } from "../pull.js";

let tmpDir: string;
let logs: string[];
let errorLogs: string[];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pull-test-"));
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
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
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

describe("pullCommand", () => {
  it("errors when no remote configured", async () => {
    writeManifest();
    const git = simpleGit(tmpDir);
    await git.init();
    await git.addConfig("user.email", "test@test.com");
    await git.addConfig("user.name", "Test");
    await git.add(".");
    await git.commit("initial");

    await pullCommand();
    expect(errorLogs.join("\n")).toContain("No remote configured");
  });
});
