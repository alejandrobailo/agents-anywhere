import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";
import { simpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initCommand } from "../init.js";

let sourceDir: string;
let targetDir: string;
const logs: string[] = [];
const errorLogs: string[] = [];

beforeEach(() => {
  sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "init-test-source-"));
  targetDir = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "init-test-target-")),
    "cloned",
  );
  logs.length = 0;
  errorLogs.length = 0;
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errorLogs.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(sourceDir, { recursive: true, force: true });
  // targetDir parent was created by mkdtempSync
  const targetParent = path.dirname(targetDir);
  fs.rmSync(targetParent, { recursive: true, force: true });
});

/** Create a git repo at the given dir with an initial commit */
async function makeGitRepo(dir: string, files: Record<string, string>) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, "utf-8");
  }
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.email", "test@test.com");
  await git.addConfig("user.name", "Test");
  await git.add(".");
  await git.commit("initial commit");
}

describe("init --from", () => {
  it("clones a valid agents-anywhere config repo via file:// URL", async () => {
    await makeGitRepo(sourceDir, {
      "agents-anywhere.json": JSON.stringify({ version: "0.1.0", agents: {} }),
      "mcp.json": JSON.stringify({ servers: {} }),
    });

    await initCommand(targetDir, { from: `file://${sourceDir}` });

    expect(fs.existsSync(path.join(targetDir, "agents-anywhere.json"))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, "mcp.json"))).toBe(true);

    const output = logs.join("\n");
    expect(output).toContain("Cloned config repo to");
    // initFromRemote now auto-detects and links agents
    expect(output).toContain("Detecting installed AI coding agents");
  });

  it("errors and cleans up when cloned repo has no agents-anywhere.json", async () => {
    await makeGitRepo(sourceDir, {
      "README.md": "# not an agents-anywhere repo",
    });

    await initCommand(targetDir, { from: `file://${sourceDir}` });

    const output = errorLogs.join("\n");
    expect(output).toContain("Not an agents-anywhere config repo");
    // Cloned directory should be cleaned up
    expect(fs.existsSync(targetDir)).toBe(false);
  });

  it("warns and exits early when target already has agents-anywhere.json", async () => {
    // Create target with existing agents-anywhere.json
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(
      path.join(targetDir, "agents-anywhere.json"),
      "{}",
      "utf-8",
    );

    await makeGitRepo(sourceDir, {
      "agents-anywhere.json": JSON.stringify({ version: "0.1.0", agents: {} }),
    });

    await initCommand(targetDir, { from: `file://${sourceDir}` });

    const output = logs.join("\n");
    expect(output).toContain("already exists");
    // Should NOT have cloned (no "Cloned config repo" message)
    expect(output).not.toContain("Cloned config repo to");
  });

});
