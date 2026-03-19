/**
 * agentsync doctor — diagnose config health for all enabled agents.
 *
 * Checks:
 *  1. Broken symlinks — linked files pointing to non-existent targets
 *  2. Credentials in repo — credential files that should never be committed
 *  3. Stale configs — symlinked items whose repo source is missing
 *  4. MCP config freshness — generated MCP files older than mcp.json
 */

import * as fs from "node:fs";
import path from "node:path";
import type { AgentDefinition } from "../schemas/agent-schema.js";
import { loadAgentById } from "../core/schema-loader.js";
import { loadManifest } from "../utils/manifest.js";
import { expandPath, getPlatformPath } from "../utils/paths.js";
import { heading, success, error, warn, dim } from "../utils/output.js";

export interface Issue {
  agent: string;
  message: string;
  fix: string;
}

/**
 * Get top-level portable item names from glob patterns.
 * "commands/**" → "commands", "settings.json" → "settings.json"
 */
function getPortableItems(agentDef: AgentDefinition): string[] {
  const items = new Set<string>();
  for (const pattern of agentDef.portable) {
    items.add(pattern.split("/")[0]);
  }
  return [...items];
}

/**
 * Check 1: Find broken symlinks in agent config directories.
 * A broken symlink exists in the agent config dir but its target no longer exists.
 */
export function checkBrokenSymlinks(
  agents: Array<{ id: string; def: AgentDefinition }>,
  repoDir: string,
): Issue[] {
  const issues: Issue[] = [];

  for (const { id, def } of agents) {
    const configDir = expandPath(getPlatformPath(def.configDir));
    const items = getPortableItems(def);

    for (const item of items) {
      const agentPath = path.join(configDir, item);
      try {
        const stat = fs.lstatSync(agentPath);
        if (stat.isSymbolicLink()) {
          const target = fs.readlinkSync(agentPath);
          const resolved = path.resolve(path.dirname(agentPath), target);
          if (!fs.existsSync(resolved)) {
            issues.push({
              agent: def.name,
              message: `${item} → ${resolved} (target missing)`,
              fix: `Run \`agentsync unlink ${id} && agentsync link ${id}\``,
            });
          }
        }
      } catch {
        // Path doesn't exist at all — not a broken symlink
      }
    }
  }

  return issues;
}

/**
 * Check 2: Scan repo directory for credential files that shouldn't be committed.
 */
export function checkCredentialsInRepo(
  agents: Array<{ id: string; def: AgentDefinition }>,
  repoDir: string,
): Issue[] {
  const issues: Issue[] = [];

  for (const { def } of agents) {
    for (const credPath of def.credentials) {
      const credFileName = path.basename(expandPath(credPath));

      // Check repo root
      const inRoot = path.join(repoDir, credFileName);
      if (fs.existsSync(inRoot)) {
        issues.push({
          agent: def.name,
          message: `${credFileName} found at repo root`,
          fix: `Remove ${inRoot} and add to .gitignore`,
        });
      }

      // Check agent subdirectory
      const inAgentDir = path.join(repoDir, def.id, credFileName);
      if (fs.existsSync(inAgentDir)) {
        issues.push({
          agent: def.name,
          message: `${credFileName} found in ${def.id}/ directory`,
          fix: `Remove ${inAgentDir} and add to .gitignore`,
        });
      }
    }
  }

  return issues;
}

/**
 * Check 3: For linked agents, verify symlink targets still exist in the repo.
 * Catches cases where the repo-side file was deleted but the symlink remains.
 */
export function checkStaleConfigs(
  agents: Array<{ id: string; def: AgentDefinition }>,
  repoDir: string,
): Issue[] {
  const issues: Issue[] = [];

  for (const { id, def } of agents) {
    const configDir = expandPath(getPlatformPath(def.configDir));
    const agentRepoDir = path.join(repoDir, id);
    const items = getPortableItems(def);

    for (const item of items) {
      const agentPath = path.join(configDir, item);
      const repoPath = path.join(agentRepoDir, item);

      try {
        const stat = fs.lstatSync(agentPath);
        if (stat.isSymbolicLink() && !fs.existsSync(repoPath)) {
          issues.push({
            agent: def.name,
            message: `${item} is linked but missing from repo`,
            fix: `Run \`agentsync unlink ${id}\` to clean up, then re-add the file`,
          });
        }
      } catch {
        // Not symlinked or doesn't exist
      }
    }
  }

  return issues;
}

/**
 * Check 4: Compare mcp.json mtime vs generated MCP config file mtimes.
 * Warns if generated files are older than the source mcp.json.
 */
export function checkMCPFreshness(
  agents: Array<{ id: string; def: AgentDefinition }>,
  repoDir: string,
): Issue[] {
  const issues: Issue[] = [];
  const mcpJsonPath = path.join(repoDir, "mcp.json");

  if (!fs.existsSync(mcpJsonPath)) {
    return issues;
  }

  const mcpMtime = fs.statSync(mcpJsonPath).mtimeMs;

  for (const { def } of agents) {
    const configDir = expandPath(getPlatformPath(def.configDir));
    const generatedPath = path.join(configDir, def.mcp.configPath);

    if (fs.existsSync(generatedPath)) {
      const genMtime = fs.statSync(generatedPath).mtimeMs;
      if (genMtime < mcpMtime) {
        issues.push({
          agent: def.name,
          message: `${def.mcp.configPath} is older than mcp.json`,
          fix: "Run `agentsync mcp sync` to regenerate",
        });
      }
    }
  }

  return issues;
}

export async function doctorCommand(): Promise<void> {
  const manifest = loadManifest();
  if (!manifest) return;

  const repoDir = manifest.repoDir;
  const enabledIds = Object.entries(manifest.agents)
    .filter(([, v]) => v.enabled)
    .map(([id]) => id);

  if (enabledIds.length === 0) {
    warn("No agents enabled in agentsync.json");
    return;
  }

  heading("agentsync doctor");
  console.log();

  const agents = enabledIds
    .map((id) => ({ id, def: loadAgentById(id) }))
    .filter(
      (a): a is { id: string; def: AgentDefinition } => a.def !== undefined,
    );

  const checks: Array<{ name: string; issues: Issue[] }> = [
    { name: "Broken symlinks", issues: checkBrokenSymlinks(agents, repoDir) },
    {
      name: "Credentials in repo",
      issues: checkCredentialsInRepo(agents, repoDir),
    },
    { name: "Stale configs", issues: checkStaleConfigs(agents, repoDir) },
    {
      name: "MCP config freshness",
      issues: checkMCPFreshness(agents, repoDir),
    },
  ];

  let totalIssues = 0;

  for (const check of checks) {
    if (check.issues.length === 0) {
      success(check.name);
    } else {
      error(check.name);
      for (const issue of check.issues) {
        console.log(`    ${issue.agent}: ${issue.message}`);
        console.log(`    ${dim(`Fix: ${issue.fix}`)}`);
      }
      totalIssues += check.issues.length;
    }
  }

  console.log();
  if (totalIssues === 0) {
    success("All checks passed — config is healthy");
  } else {
    warn(`${totalIssues} issue(s) found`);
  }
}
