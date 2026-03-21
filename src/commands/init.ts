/**
 * agents-anywhere init — detect agents, create config repo, scaffold structure.
 *
 * Creates:
 *   agents-anywhere-config/
 *   ├── agents-anywhere.json      (manifest)
 *   ├── mcp.json             (empty normalized MCP config)
 *   ├── .gitignore
 *   ├── claude-code/         (per-agent dirs for detected agents)
 *   └── codex/
 */

import * as fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { simpleGit } from "simple-git";
import { detectAgents } from "../core/detector.js";
import type { DetectedAgent } from "../core/detector.js";
import { heading, success, error, info, warn, dim } from "../utils/output.js";

const DEFAULT_REPO_DIR = path.join(os.homedir(), "agents-anywhere-config");

const POST_MERGE_HOOK = `#!/bin/sh
# agents-anywhere post-merge hook — re-link configs and regenerate MCP on pull
agents-anywhere link
agents-anywhere mcp sync
`;

const GITIGNORE = `# agents-anywhere generated
*.backup.*

# OS files
.DS_Store
Thumbs.db
`;

export interface InitOptions {
  from?: string;
}

export async function initCommand(
  repoDir?: string,
  options?: InitOptions,
): Promise<void> {
  const targetDir = repoDir ?? DEFAULT_REPO_DIR;

  if (options?.from) {
    await initFromRemote(options.from, targetDir);
    return;
  }

  heading("Detecting installed AI coding agents...");

  const agents = detectAgents();
  const installed = agents.filter((a) => a.installed);

  if (installed.length === 0) {
    warn("No AI coding agents detected.");
    info("Supported agents: " + agents.map((a) => a.definition.name).join(", "));
    return;
  }

  for (const agent of agents) {
    if (agent.installed) {
      success(`${agent.definition.name}    ${dim(agent.configDir)}`);
    } else {
      info(`${agent.definition.name}    ${dim("not installed")}`);
    }
  }

  // Check if repo already exists
  if (fs.existsSync(path.join(targetDir, "agents-anywhere.json"))) {
    warn(`Config repo already exists at ${targetDir}`);
    info("Run `agents-anywhere link` to connect your agents.");
    return;
  }

  heading("Creating config repo...");

  // Create repo directory
  fs.mkdirSync(targetDir, { recursive: true });

  // Create agents-anywhere.json manifest
  const manifest = buildManifest(installed, targetDir);
  fs.writeFileSync(
    path.join(targetDir, "agents-anywhere.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf-8",
  );
  success("agents-anywhere.json");

  // Create empty mcp.json
  const emptyMCP = { servers: {} };
  fs.writeFileSync(
    path.join(targetDir, "mcp.json"),
    JSON.stringify(emptyMCP, null, 2) + "\n",
    "utf-8",
  );
  success("mcp.json");

  // Create .gitignore
  fs.writeFileSync(path.join(targetDir, ".gitignore"), GITIGNORE, "utf-8");
  success(".gitignore");

  // Create per-agent directories
  for (const agent of installed) {
    const agentDir = path.join(targetDir, agent.definition.id);
    fs.mkdirSync(agentDir, { recursive: true });
    success(`${agent.definition.id}/`);
  }

  // git init
  const git = simpleGit(targetDir);
  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    await git.init();
    success("git init");
  }

  // Set up post-merge hook
  const hooksDir = path.join(targetDir, ".git", "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });
  const hookPath = path.join(hooksDir, "post-merge");
  fs.writeFileSync(hookPath, POST_MERGE_HOOK, { mode: 0o755 });
  success("post-merge hook");

  console.log(
    `\nCreated config repo at ${dim(targetDir)}`,
  );
  info("Run `agents-anywhere link` to connect your agents.");
}

async function initFromRemote(url: string, targetDir: string): Promise<void> {
  // Check if target already has agents-anywhere.json
  if (fs.existsSync(path.join(targetDir, "agents-anywhere.json"))) {
    warn(`Config repo already exists at ${targetDir}`);
    info("Run `agents-anywhere link` to connect your agents.");
    return;
  }

  heading("Cloning config repo...");

  const git = simpleGit();
  try {
    await git.clone(url, targetDir);
  } catch (err) {
    error(`Failed to clone ${url}: ${(err as Error).message}`);
    return;
  }

  // Verify the cloned repo is a valid agents-anywhere config repo
  if (!fs.existsSync(path.join(targetDir, "agents-anywhere.json"))) {
    // Clean up the cloned directory since it's not a valid config repo
    fs.rmSync(targetDir, { recursive: true, force: true });
    error(`Not an agents-anywhere config repo: ${url} (no agents-anywhere.json found)`);
    return;
  }

  success(`Cloned config repo to ${targetDir}`);
  info("Run `agents-anywhere link && agents-anywhere mcp sync` to connect your agents.");
}

function buildManifest(
  installedAgents: DetectedAgent[],
  repoDir: string,
): Record<string, unknown> {
  return {
    version: "0.1.0",
    repoDir,
    agents: Object.fromEntries(
      installedAgents.map((a) => [
        a.definition.id,
        { enabled: true, name: a.definition.name },
      ]),
    ),
  };
}
