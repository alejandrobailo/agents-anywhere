import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";
import { simpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pushCommand } from "../push.js";

let tmpDir: string;
let logs: string[];
let errorLogs: string[];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "push-test-"));
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

describe("pushCommand", () => {
  it("reports no changes when repo is clean", async () => {
    writeManifest();
    const git = simpleGit(tmpDir);
    await git.init();
    await git.addConfig("user.email", "test@test.com");
    await git.addConfig("user.name", "Test");
    await git.add(".");
    await git.commit("initial");

    await pushCommand();
    expect(logs.join("\n")).toContain("No changes");
  });

  it("warns when no remote configured", async () => {
    writeManifest();
    const git = simpleGit(tmpDir);
    await git.init();
    await git.addConfig("user.email", "test@test.com");
    await git.addConfig("user.name", "Test");
    await git.add(".");
    await git.commit("initial");

    // Create a new file to have changes
    fs.writeFileSync(path.join(tmpDir, "test.txt"), "hello");

    await pushCommand();
    expect(logs.join("\n")).toContain("No remote configured");
  });
});
