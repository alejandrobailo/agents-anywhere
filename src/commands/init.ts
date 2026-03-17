/**
 * agentsync init — detect agents, create config repo, scaffold structure.
 *
 * Creates:
 *   agentsync-config/
 *   ├── agentsync.json      (manifest)
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
import { heading, success, info, warn, dim } from "../utils/output.js";

const DEFAULT_REPO_DIR = path.join(os.homedir(), "agentsync-config");

const POST_MERGE_HOOK = `#!/bin/sh
# agentsync post-merge hook — re-link configs and regenerate MCP on pull
agentsync link
agentsync mcp sync
`;

const GITIGNORE = `# agentsync generated
*.backup.*

# OS files
.DS_Store
Thumbs.db
`;

export async function initCommand(repoDir?: string): Promise<void> {
  const targetDir = repoDir ?? DEFAULT_REPO_DIR;

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
  if (fs.existsSync(path.join(targetDir, "agentsync.json"))) {
    warn(`Config repo already exists at ${targetDir}`);
    info("Run `agentsync link` to connect your agents.");
    return;
  }

  heading("Creating config repo...");

  // Create repo directory
  fs.mkdirSync(targetDir, { recursive: true });

  // Create agentsync.json manifest
  const manifest = buildManifest(installed, targetDir);
  fs.writeFileSync(
    path.join(targetDir, "agentsync.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf-8",
  );
  success("agentsync.json");

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
  info("Run `agentsync link` to connect your agents.");
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
