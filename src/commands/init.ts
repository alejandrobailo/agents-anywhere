/**
 * agents-anywhere init — one-command setup.
 *
 * Detects installed agents, copies portable configs, syncs instructions
 * from a primary agent, imports MCP servers, links everything, and
 * optionally creates a private GitHub repo.
 */

import * as fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import select from "@inquirer/select";
import confirm from "@inquirer/confirm";
import { simpleGit } from "simple-git";
import { detectAgents } from "../core/detector.js";
import type { DetectedAgent } from "../core/detector.js";
import { linkAgent, getPortableItems, lstatExists } from "../core/linker.js";
import { importAndMergeAll } from "../mcp/importer.js";
import { parseMCPConfig } from "../mcp/parser.js";
import { transformForAgent } from "../mcp/transformer.js";
import { writeJSON, mergeJSON, writeTOML } from "../mcp/writer.js";
import { expandPath, getPlatformPath } from "../utils/paths.js";
import { heading, success, error, info, warn, dim, debug } from "../utils/output.js";

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

  // Step 1: Detect agents
  heading("Detecting installed AI coding agents...");

  const agents = detectAgents();
  const installed = agents.filter((a) => a.installed);

  if (installed.length === 0) {
    warn("No AI coding agents detected.");
    info(
      "Supported agents: " +
        agents.map((a) => a.definition.name).join(", "),
    );
    return;
  }

  for (const agent of agents) {
    if (agent.installed) {
      success(`${agent.definition.name}    ${dim(agent.configDir)}`);
    } else {
      info(`${agent.definition.name}    ${dim("not installed")}`);
    }
  }

  // Guard: already exists
  if (fs.existsSync(path.join(targetDir, "agents-anywhere.json"))) {
    warn(`Config repo already exists at ${targetDir}`);
    info("Run `agents-anywhere link` to connect your agents.");
    return;
  }

  // Step 2: Select primary agent
  const primary = await promptPrimaryAgent(installed);

  // Step 3: Create repo + git init
  heading("Creating config repo...");
  fs.mkdirSync(targetDir, { recursive: true });

  const git = simpleGit(targetDir);
  if (!(await git.checkIsRepo())) {
    await git.init();
    success("git init");
  }

  // Step 4: Copy portable files from all agents
  copyPortableFiles(installed, targetDir);

  // Step 5: Sync instructions via symlinks
  syncInstructions(primary, installed, targetDir);

  // Step 6: Import MCP servers
  importMCPServers(installed, targetDir);

  // Step 7: Write manifest, .gitignore, post-merge hook
  const manifest = buildManifest(installed, targetDir, primary.definition.id);
  fs.writeFileSync(
    path.join(targetDir, "agents-anywhere.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf-8",
  );
  success("agents-anywhere.json");

  fs.writeFileSync(path.join(targetDir, ".gitignore"), GITIGNORE, "utf-8");
  success(".gitignore");

  const hooksDir = path.join(targetDir, ".git", "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(path.join(hooksDir, "post-merge"), POST_MERGE_HOOK, {
    mode: 0o755,
  });
  success("post-merge hook");

  // Step 8: Link all agents
  heading("Linking agent configs...");
  for (const agent of installed) {
    const results = linkAgent(agent.definition, targetDir);
    const linked = results.filter(
      (r) => r.action === "linked" || r.action === "backed-up-and-linked",
    );
    if (linked.length > 0) {
      success(`${agent.definition.name} — ${linked.length} item(s) linked`);
    }
  }

  // Step 9: MCP sync
  syncMCPToAllAgents(targetDir, installed);

  // Step 10: Initial commit
  await git.add(".");
  await git.commit("Initial agents-anywhere setup");
  success("Initial commit created");

  console.log(`\n${dim("Setup complete!")} Config repo at ${dim(targetDir)}`);

  // Step 11: Optional GitHub repo
  await promptGitHubRepo(targetDir);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function promptPrimaryAgent(
  installed: DetectedAgent[],
): Promise<DetectedAgent> {
  const candidates = installed.filter(
    (a) => a.definition.instructions.globalSupport,
  );

  if (candidates.length === 0) {
    warn(
      "No installed agents support global instructions — instruction syncing will be skipped.",
    );
    return installed[0];
  }

  if (candidates.length === 1) {
    info(
      `Using ${candidates[0].definition.name} as primary agent.`,
    );
    return candidates[0];
  }

  // Non-interactive mode (tests, piped input)
  if (!process.stdin.isTTY) {
    info(
      `Using ${candidates[0].definition.name} as primary agent (non-interactive).`,
    );
    return candidates[0];
  }

  const chosen = await select({
    message: "Which agent is your primary? (its instructions become the source of truth)",
    choices: candidates.map((c) => ({
      name: c.definition.name,
      value: c.definition.id,
    })),
  });

  return candidates.find((c) => c.definition.id === chosen)!;
}

function copyPortableFiles(
  installed: DetectedAgent[],
  repoDir: string,
): void {
  heading("Copying portable files...");

  for (const agent of installed) {
    const def = agent.definition;
    const configDir = agent.configDir;
    const agentRepoDir = path.join(repoDir, def.id);
    fs.mkdirSync(agentRepoDir, { recursive: true });

    const items = getPortableItems(def);
    const ignoreRoots = new Set(def.ignore.map((p) => p.split("/")[0]));
    const credBasenames = new Set(
      def.credentials.map((c) => path.basename(expandPath(c))),
    );

    let copied = 0;
    for (const item of items) {
      if (ignoreRoots.has(item) || credBasenames.has(item)) continue;

      const sourcePath = path.join(configDir, item);
      const destPath = path.join(agentRepoDir, item);

      if (!fs.existsSync(sourcePath)) continue;

      // Skip symlinks to avoid copying from a previous setup
      if (lstatExists(sourcePath) && fs.lstatSync(sourcePath).isSymbolicLink()) {
        // Follow symlink and copy the real content
        const realPath = fs.realpathSync(sourcePath);
        if (!fs.existsSync(realPath)) continue;
        const stat = fs.statSync(realPath);
        if (stat.isDirectory()) {
          fs.cpSync(realPath, destPath, { recursive: true });
        } else {
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(realPath, destPath);
        }
        copied++;
        continue;
      }

      const stat = fs.statSync(sourcePath);
      if (stat.isDirectory()) {
        fs.cpSync(sourcePath, destPath, { recursive: true, dereference: true });
      } else {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(sourcePath, destPath);
      }
      copied++;
    }

    if (copied > 0) {
      success(`${def.name} — copied ${copied} item(s)`);
    } else {
      info(`${def.name} — no portable files found`);
    }
  }
}

function syncInstructions(
  primary: DetectedAgent,
  installed: DetectedAgent[],
  repoDir: string,
): void {
  heading("Syncing instructions...");

  const primaryDef = primary.definition;
  const isFileBased = primaryDef.instructions.filename.includes(".");

  // Resolve primary instructions path in repo
  let primaryInstructionsPath: string;
  if (isFileBased) {
    primaryInstructionsPath = path.join(
      repoDir,
      primaryDef.id,
      primaryDef.instructions.filename,
    );
  } else {
    // Directory-based (e.g., Kiro steering/)
    primaryInstructionsPath = path.join(
      repoDir,
      primaryDef.id,
      primaryDef.instructions.filename,
      "instructions.md",
    );
  }

  if (!fs.existsSync(primaryInstructionsPath)) {
    fs.mkdirSync(path.dirname(primaryInstructionsPath), { recursive: true });
    fs.writeFileSync(
      primaryInstructionsPath,
      "# Agent Instructions\n\nAdd your instructions here.\n",
      "utf-8",
    );
    info(`Created empty instructions file for ${primaryDef.name}`);
  }

  success(`${primaryDef.name} — instructions file (source of truth)`);

  // Create symlinks for other agents
  for (const agent of installed) {
    if (agent.definition.id === primaryDef.id) continue;

    const def = agent.definition;
    const agentRepoDir = path.join(repoDir, def.id);

    if (!def.instructions.globalSupport) {
      warn(`${def.name} — project-level rules only, instructions not synced`);
      continue;
    }

    const isTargetFileBased = def.instructions.filename.includes(".");
    let symlinkPath: string;

    if (isTargetFileBased) {
      symlinkPath = path.join(agentRepoDir, def.instructions.filename);
    } else {
      // Directory-based with global support (e.g., Kiro)
      const targetDir = path.join(agentRepoDir, def.instructions.filename);
      fs.mkdirSync(targetDir, { recursive: true });
      symlinkPath = path.join(targetDir, "instructions.md");
    }

    // Remove existing file at target (was copied in copyPortableFiles)
    if (lstatExists(symlinkPath)) {
      const stat = fs.lstatSync(symlinkPath);
      if (!stat.isSymbolicLink()) {
        const backupPath = `${symlinkPath}.backup.${Date.now()}`;
        fs.renameSync(symlinkPath, backupPath);
      } else {
        fs.unlinkSync(symlinkPath);
      }
    }

    fs.mkdirSync(path.dirname(symlinkPath), { recursive: true });
    const symlinkTarget = path.relative(
      path.dirname(symlinkPath),
      primaryInstructionsPath,
    );
    fs.symlinkSync(symlinkTarget, symlinkPath);
    success(`${def.name} — ${def.instructions.filename} → ${symlinkTarget}`);
  }
}

function importMCPServers(
  installed: DetectedAgent[],
  repoDir: string,
): void {
  heading("Importing MCP servers...");

  const agentDefs = installed.map((a) => a.definition);
  const result = importAndMergeAll(agentDefs);

  const serverCount = Object.keys(result.config.servers).length;

  if (serverCount === 0) {
    info("No MCP servers found in any agent configs.");
    fs.writeFileSync(
      path.join(repoDir, "mcp.json"),
      JSON.stringify({ servers: {} }, null, 2) + "\n",
      "utf-8",
    );
    return;
  }

  for (const [name, agentId] of Object.entries(result.sources)) {
    success(`${name} — imported from ${agentId}`);
  }

  for (const conflict of result.conflicts) {
    warn(
      `${conflict.serverName} — found in ${conflict.agents.join(" and ")}, kept version from ${conflict.kept}`,
    );
  }

  fs.writeFileSync(
    path.join(repoDir, "mcp.json"),
    JSON.stringify(result.config, null, 2) + "\n",
    "utf-8",
  );
  success(`Imported ${serverCount} MCP server(s) to mcp.json`);
}

function syncMCPToAllAgents(
  repoDir: string,
  installed: DetectedAgent[],
): void {
  const mcpPath = path.join(repoDir, "mcp.json");
  if (!fs.existsSync(mcpPath)) return;

  let config;
  try {
    config = parseMCPConfig(mcpPath);
  } catch (err) {
    debug(`Failed to parse MCP config at ${mcpPath}: ${(err as Error).message}`);
    return;
  }

  if (Object.keys(config.servers).length === 0) return;

  heading("Syncing MCP config to agents...");
  for (const agent of installed) {
    const agentDef = agent.definition;
    const result = transformForAgent(config, agentDef);
    const configDir = expandPath(getPlatformPath(agentDef.configDir));
    const targetPath = path.join(configDir, agentDef.mcp.configPath);

    if (result.format === "toml") {
      writeTOML(targetPath, result.rootKey, result.servers);
    } else if (agentDef.mcp.writeMode === "merge") {
      mergeJSON(targetPath, result.rootKey, result.servers);
    } else {
      writeJSON(targetPath, result.rootKey, result.servers);
    }
    success(`${agentDef.name} — wrote ${dim(targetPath)}`);
  }
}

async function promptGitHubRepo(repoDir: string): Promise<void> {
  // Skip in non-interactive mode
  if (!process.stdin.isTTY) return;

  // Check if gh CLI is available
  try {
    execSync("gh --version", { stdio: "ignore" });
  } catch {
    info(
      "Install GitHub CLI (gh) to create a private repo: https://cli.github.com",
    );
    return;
  }

  const shouldCreate = await confirm({
    message: "Create a private GitHub repo and push?",
    default: false,
  });
  if (!shouldCreate) return;

  const repoName = path.basename(repoDir);
  try {
    execSync(
      `gh repo create ${repoName} --private --source="${repoDir}" --push`,
      { stdio: "inherit", cwd: repoDir },
    );
    success(`Created and pushed to private GitHub repo: ${repoName}`);
  } catch (err) {
    warn(`Failed to create GitHub repo: ${(err as Error).message}`);
    info("You can create it manually later with: gh repo create");
  }
}

// ---------------------------------------------------------------------------
// --from (unchanged)
// ---------------------------------------------------------------------------

async function initFromRemote(url: string, targetDir: string): Promise<void> {
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

  if (!fs.existsSync(path.join(targetDir, "agents-anywhere.json"))) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    error(
      `Not an agents-anywhere config repo: ${url} (no agents-anywhere.json found)`,
    );
    return;
  }

  success(`Cloned config repo to ${targetDir}`);
  info(
    "Run `agents-anywhere link && agents-anywhere mcp sync` to connect your agents.",
  );
}

// ---------------------------------------------------------------------------
// Manifest builder
// ---------------------------------------------------------------------------

function buildManifest(
  installedAgents: DetectedAgent[],
  repoDir: string,
  primaryAgentId: string,
): Record<string, unknown> {
  return {
    version: "0.1.0",
    repoDir,
    primaryAgent: primaryAgentId,
    agents: Object.fromEntries(
      installedAgents.map((a) => [
        a.definition.id,
        { enabled: true, name: a.definition.name },
      ]),
    ),
  };
}
