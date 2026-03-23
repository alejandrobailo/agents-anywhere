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
import { diffLocalVsRepo, copyLocalToRepo } from "../core/sync.js";
import { importAndMergeAll } from "../mcp/importer.js";
import { parseMCPConfig } from "../mcp/parser.js";
import { transformForAgent } from "../mcp/transformer.js";
import { writeJSON, mergeJSON, writeTOML } from "../mcp/writer.js";
import { expandPath, getPlatformPath } from "../utils/paths.js";
import type { Manifest } from "../utils/manifest.js";
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

  // Guard: already exists — offer to re-link and sync
  if (fs.existsSync(path.join(targetDir, "agents-anywhere.json"))) {
    warn(`Config repo already exists at ${targetDir}`);

    // Check if remote is configured
    let hasRemote = false;
    try {
      const remote = execSync("git remote get-url origin", {
        cwd: targetDir,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      info(`Remote: ${remote}`);
      hasRemote = true;
    } catch {
      warn("No git remote configured.");
    }

    if (process.stdin.isTTY) {
      const shouldRelink = await confirm({
        message: "Re-link agents and sync MCP configs?",
        default: true,
      });

      if (shouldRelink) {
        heading("Linking agent configs...");
        for (const agent of installed) {
          const results = linkAgent(agent.definition, targetDir);
          const linked = results.filter(
            (r) => r.action === "linked" || r.action === "backed-up-and-linked",
          );
          if (linked.length > 0) {
            success(`${agent.definition.name} — ${linked.length} item(s) linked`);
          } else {
            info(`${agent.definition.name} — already linked`);
          }
        }
        syncMCPToAllAgents(targetDir, installed);
      }

      if (!hasRemote) {
        await promptGitHubRepo(targetDir);
      }
    }

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
  const manifest = buildManifest(installed, primary.definition.id);
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

/**
 * Resolve the best source path for a portable item.
 * Priority: real file > symlink target > most recent backup.
 */
function resolveSourcePath(
  sourcePath: string,
  configDir: string,
  item: string,
): string | null {
  const isSymlink = lstatExists(sourcePath) && fs.lstatSync(sourcePath).isSymbolicLink();

  if (isSymlink) {
    // Follow symlink — if target exists, use it
    try {
      const realPath = fs.realpathSync(sourcePath);
      if (fs.existsSync(realPath)) return realPath;
    } catch {
      // Broken symlink — fall through to backup
    }

    // Broken symlink — look for a backup
    const backup = findBackup(configDir, item);
    if (backup) {
      const backupPath = path.join(configDir, backup);
      // Backup might also be a symlink — dereference it
      if (lstatExists(backupPath) && fs.lstatSync(backupPath).isSymbolicLink()) {
        try {
          const realBackup = fs.realpathSync(backupPath);
          if (fs.existsSync(realBackup)) return realBackup;
        } catch {
          return null;
        }
      }
      if (fs.existsSync(backupPath)) return backupPath;
    }
    return null;
  }

  // Real file/dir
  if (fs.existsSync(sourcePath)) return sourcePath;
  return null;
}

/**
 * Find the most recent backup for an item in a directory.
 */
function findBackup(dir: string, item: string): string | undefined {
  try {
    const entries = fs.readdirSync(dir);
    const prefix = `${item}.backup.`;
    const backups = entries
      .filter((e) => e.startsWith(prefix))
      .sort()
      .reverse();
    return backups[0];
  } catch {
    return undefined;
  }
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

      // Resolve the actual source: real file, symlink target, or backup
      const resolvedSource = resolveSourcePath(sourcePath, configDir, item);
      if (!resolvedSource) continue;

      const stat = fs.statSync(resolvedSource);
      if (stat.isDirectory()) {
        fs.cpSync(resolvedSource, destPath, { recursive: true, dereference: true });
      } else {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(resolvedSource, destPath);
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
  } catch {
    // Repo may already exist on GitHub — try to connect and push instead
    try {
      const ghUser = execSync("gh api user -q .login", { encoding: "utf-8", cwd: repoDir }).trim();
      const remoteUrl = `https://github.com/${ghUser}/${repoName}.git`;
      execSync(`git remote add origin ${remoteUrl}`, { stdio: "inherit", cwd: repoDir });
      execSync("git push -u origin main", { stdio: "inherit", cwd: repoDir });
      success(`Connected to existing repo and pushed: ${ghUser}/${repoName}`);
    } catch (err2) {
      warn(`Failed to create or connect GitHub repo: ${(err2 as Error).message}`);
      info("You can set it up manually: git remote add origin <url> && git push");
    }
  }
}

// ---------------------------------------------------------------------------
// --from (clone + detect + merge + link)
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

  // Detect installed agents on this device
  heading("Detecting installed AI coding agents...");
  const agents = detectAgents();
  const installed = agents.filter((a) => a.installed);

  if (installed.length === 0) {
    warn("No AI coding agents detected on this machine.");
    info("Run `agents-anywhere link` after installing an agent.");
    return;
  }

  for (const agent of agents) {
    if (agent.installed) {
      success(`${agent.definition.name}    ${dim(agent.configDir)}`);
    } else {
      info(`${agent.definition.name}    ${dim("not installed")}`);
    }
  }

  // Compare local portable files against cloned repo
  const diffs = diffLocalVsRepo(installed, targetDir);
  const actionable = diffs.filter(
    (d) => d.status === "local-only" || d.status === "diverged",
  );

  if (actionable.length > 0) {
    heading("Local files to sync with repo:");
    for (const diff of actionable) {
      const label = diff.status === "diverged" ? "changed" : "new";
      info(`  ${diff.agentName} — ${diff.item} (${label})`);
    }

    let shouldMerge = true;
    if (process.stdin.isTTY) {
      shouldMerge = await confirm({
        message: "Copy these local files into the repo? (No = use remote as-is)",
        default: true,
      });
    }

    if (shouldMerge) {
      for (const diff of actionable) {
        copyLocalToRepo(diff);
        success(`Copied ${diff.agentName}/${diff.item}`);
      }
    }
  }

  // Update manifest with newly detected agents
  const manifestPath = path.join(targetDir, "agents-anywhere.json");
  let manifestData: Record<string, unknown>;
  try {
    const raw = fs.readFileSync(manifestPath, "utf-8");
    manifestData = JSON.parse(raw);
  } catch (err) {
    error(`Invalid manifest in cloned repo: ${(err as Error).message}`);
    return;
  }
  if (!manifestData.agents || typeof manifestData.agents !== "object") {
    manifestData.agents = {};
  }
  const agents_record = manifestData.agents as Record<string, unknown>;
  for (const agent of installed) {
    if (!agents_record[agent.definition.id]) {
      agents_record[agent.definition.id] = {
        enabled: true,
        name: agent.definition.name,
      };
    }
  }
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(manifestData, null, 2) + "\n",
    "utf-8",
  );

  // Install post-merge hook
  const hooksDir = path.join(targetDir, ".git", "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(path.join(hooksDir, "post-merge"), POST_MERGE_HOOK, {
    mode: 0o755,
  });

  // Link all installed agents
  heading("Linking agent configs...");
  for (const agent of installed) {
    const results = linkAgent(agent.definition, targetDir);
    const linked = results.filter(
      (r) => r.action === "linked" || r.action === "backed-up-and-linked",
    );
    if (linked.length > 0) {
      const items = linked.map((r) => r.item).join(", ");
      success(`${agent.definition.name} — ${items} linked`);
      for (const r of results) {
        if (r.action === "backed-up-and-linked") {
          info(`  backed up existing ${r.item}`);
        }
      }
    }
  }

  // Sync MCP configs
  syncMCPToAllAgents(targetDir, installed);

  // Commit any local additions
  const repoGit = simpleGit(targetDir);
  const status = await repoGit.status();
  if (!status.isClean()) {
    await repoGit.add(".");
    await repoGit.commit("Merge local agent configs from new device");
    success("Committed local config additions");
  }

  console.log(`\n${dim("Setup complete!")} Config repo at ${dim(targetDir)}`);
}

// ---------------------------------------------------------------------------
// Manifest builder
// ---------------------------------------------------------------------------

function buildManifest(
  installedAgents: DetectedAgent[],
  primaryAgentId: string,
): Omit<Manifest, "repoDir"> {
  return {
    version: "0.1.0",
    primaryAgent: primaryAgentId,
    agents: Object.fromEntries(
      installedAgents.map((a) => [
        a.definition.id,
        { enabled: true, name: a.definition.name },
      ]),
    ),
  };
}
