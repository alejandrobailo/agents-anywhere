import {
  existsSync,
  lstatSync,
  readlinkSync,
  symlinkSync,
  renameSync,
  unlinkSync,
  mkdirSync,
  readdirSync,
  cpSync,
} from "node:fs";
import path from "node:path";
import type { AgentDefinition } from "../schemas/agent-schema.js";
import { expandPath, getPlatformPath } from "../utils/paths.js";

/** Status of a single portable file/dir */
export type LinkStatus = "linked" | "unlinked" | "diverged" | "missing";

/** Status entry for a single portable item */
export interface PortableStatus {
  item: string;
  status: LinkStatus;
  /** Absolute path in the agent's config dir */
  agentPath: string;
  /** Absolute path in the repo dir */
  repoPath: string;
}

/** Result of a link/unlink operation for a single item */
export interface LinkResult {
  item: string;
  action: "linked" | "skipped" | "backed-up-and-linked";
  agentPath: string;
}

/** Result of an unlink operation for a single item */
export interface UnlinkResult {
  item: string;
  action: "unlinked" | "restored" | "skipped";
  agentPath: string;
}

/**
 * Resolve the agent config dir and repo dir for a given agent definition.
 */
function resolvePaths(
  agentDef: AgentDefinition,
  repoDir: string,
): { configDir: string; agentRepoDir: string } {
  const configDir = expandPath(getPlatformPath(agentDef.configDir));
  const agentRepoDir = path.join(repoDir, agentDef.id);
  return { configDir, agentRepoDir };
}

/**
 * Get the list of concrete portable items for an agent.
 * Expands glob patterns like "commands/**" to just the directory name "commands".
 * Returns deduplicated list of top-level items.
 */
function getPortableItems(agentDef: AgentDefinition): string[] {
  const items = new Set<string>();
  for (const pattern of agentDef.portable) {
    // "commands/**" → "commands", "settings.json" → "settings.json"
    const topLevel = pattern.split("/")[0];
    items.add(topLevel);
  }
  return [...items];
}

/**
 * Create a timestamp string for backup naming.
 */
function backupTimestamp(): string {
  return Date.now().toString();
}

/**
 * Link an agent's portable files from the repo to the agent's config directory.
 * Creates symlinks: agentConfigDir/item → repoDir/agentId/item
 *
 * Before linking, backs up existing real files/dirs to .backup.{timestamp}.
 * If symlink already points correctly, skips with 'skipped' action.
 */
export function linkAgent(
  agentDef: AgentDefinition,
  repoDir: string,
): LinkResult[] {
  const { configDir, agentRepoDir } = resolvePaths(agentDef, repoDir);
  const items = getPortableItems(agentDef);
  const results: LinkResult[] = [];

  // Ensure config dir exists
  mkdirSync(configDir, { recursive: true });

  for (const item of items) {
    const agentPath = path.join(configDir, item);
    const repoPath = path.join(agentRepoDir, item);

    // Skip if the repo source doesn't exist
    if (!existsSync(repoPath)) {
      continue;
    }

    // Check if already a correct symlink
    if (existsSync(agentPath) || lstatExists(agentPath)) {
      if (isSymlinkTo(agentPath, repoPath)) {
        results.push({ item, action: "skipped", agentPath });
        continue;
      }

      // Existing real file/dir or wrong symlink — backup
      const backupPath = `${agentPath}.backup.${backupTimestamp()}`;
      renameSync(agentPath, backupPath);
      symlinkSync(repoPath, agentPath);
      results.push({ item, action: "backed-up-and-linked", agentPath });
      continue;
    }

    // No existing file — create symlink
    symlinkSync(repoPath, agentPath);
    results.push({ item, action: "linked", agentPath });
  }

  return results;
}

/**
 * Unlink an agent's portable files. Removes symlinks and restores
 * the most recent backup if one exists.
 */
export function unlinkAgent(
  agentDef: AgentDefinition,
  repoDir: string,
): UnlinkResult[] {
  const { configDir, agentRepoDir } = resolvePaths(agentDef, repoDir);
  const items = getPortableItems(agentDef);
  const results: UnlinkResult[] = [];

  for (const item of items) {
    const agentPath = path.join(configDir, item);
    const repoPath = path.join(agentRepoDir, item);

    // Only unlink if it's a symlink pointing to our repo
    if (!lstatExists(agentPath) || !isSymlinkTo(agentPath, repoPath)) {
      results.push({ item, action: "skipped", agentPath });
      continue;
    }

    // Remove the symlink
    unlinkSync(agentPath);

    // Restore most recent backup if available
    const backup = findMostRecentBackup(configDir, item);
    if (backup) {
      renameSync(path.join(configDir, backup), agentPath);
      results.push({ item, action: "restored", agentPath });
    } else {
      results.push({ item, action: "unlinked", agentPath });
    }
  }

  return results;
}

/**
 * Get the link status for each portable file/dir of an agent.
 */
export function getStatus(
  agentDef: AgentDefinition,
  repoDir: string,
): PortableStatus[] {
  const { configDir, agentRepoDir } = resolvePaths(agentDef, repoDir);
  const items = getPortableItems(agentDef);
  const statuses: PortableStatus[] = [];

  for (const item of items) {
    const agentPath = path.join(configDir, item);
    const repoPath = path.join(agentRepoDir, item);

    let status: LinkStatus;

    if (!existsSync(repoPath) && !lstatExists(agentPath)) {
      status = "missing";
    } else if (isSymlinkTo(agentPath, repoPath)) {
      status = "linked";
    } else if (lstatExists(agentPath)) {
      // Exists but not symlinked to repo — diverged
      status = "diverged";
    } else {
      // Repo file exists but agent path doesn't
      status = "unlinked";
    }

    statuses.push({ item, status, agentPath, repoPath });
  }

  return statuses;
}

/**
 * Check if a path exists as a symlink (even if target is broken).
 */
function lstatExists(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a path is a symlink pointing to the expected target.
 */
function isSymlinkTo(linkPath: string, expectedTarget: string): boolean {
  try {
    const stat = lstatSync(linkPath);
    if (!stat.isSymbolicLink()) return false;
    const target = readlinkSync(linkPath);
    return path.resolve(path.dirname(linkPath), target) === path.resolve(expectedTarget);
  } catch {
    return false;
  }
}

/**
 * Find the most recent backup file for a given item in a directory.
 * Backups are named: item.backup.{timestamp}
 */
function findMostRecentBackup(dir: string, item: string): string | undefined {
  try {
    const entries = readdirSync(dir);
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
