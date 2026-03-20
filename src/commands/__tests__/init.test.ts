import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";
import { simpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initCommand } from "../init.js";

let sourceDir: string;
let targetDir: string;
const logs: string[] = [];

beforeEach(() => {
  sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "init-test-source-"));
  targetDir = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "init-test-target-")),
    "cloned",
  );
  logs.length = 0;
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
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
  it("clones a valid agentsync config repo", async () => {
    await makeGitRepo(sourceDir, {
      "agentsync.json": JSON.stringify({ version: "0.1.0", agents: {} }),
      "mcp.json": JSON.stringify({ servers: {} }),
    });

    await initCommand(targetDir, { from: sourceDir });

    expect(fs.existsSync(path.join(targetDir, "agentsync.json"))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, "mcp.json"))).toBe(true);

    const output = logs.join("\n");
    expect(output).toContain("Cloned config repo to");
    expect(output).toContain("agentsync link && agentsync mcp sync");
  });

  it("errors when cloned repo has no agentsync.json", async () => {
    await makeGitRepo(sourceDir, {
      "README.md": "# not an agentsync repo",
    });

    await expect(
      initCommand(targetDir, { from: sourceDir }),
    ).rejects.toThrow("Not an agentsync config repo");
  });

  it("warns and exits early when target already has agentsync.json", async () => {
    // Create target with existing agentsync.json
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(
      path.join(targetDir, "agentsync.json"),
      "{}",
      "utf-8",
    );

    await makeGitRepo(sourceDir, {
      "agentsync.json": JSON.stringify({ version: "0.1.0", agents: {} }),
    });

    await initCommand(targetDir, { from: sourceDir });

    const output = logs.join("\n");
    expect(output).toContain("already exists");
    // Should NOT have cloned (no "Cloned config repo" message)
    expect(output).not.toContain("Cloned config repo to");
  });
});
