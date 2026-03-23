/**
 * Sync utilities — compare local agent configs against the repo
 * and copy local-only content into the repo before push/link.
 */

import * as fs from "node:fs";
import path from "node:path";
import type { DetectedAgent } from "./detector.js";
import { getPortableItems } from "./linker.js";

/** Describes a local file that differs from or is missing in the repo */
export interface SyncDiff {
  agentId: string;
  agentName: string;
  item: string;
  localPath: string;
  repoPath: string;
  status: "local-only" | "repo-only" | "diverged";
}

/**
 * Compare local portable files for installed agents against the repo.
 * Symlinked local items are skipped (already linked to repo).
 */
export function diffLocalVsRepo(
  installed: DetectedAgent[],
  repoDir: string,
): SyncDiff[] {
  const diffs: SyncDiff[] = [];

  for (const agent of installed) {
    const def = agent.definition;
    const configDir = agent.configDir;
    const agentRepoDir = path.join(repoDir, def.id);
    const items = getPortableItems(def);

    const ignoreRoots = new Set(
      (def.ignore ?? []).map((p: string) => p.split("/")[0]),
    );
    const credBasenames = new Set(
      (def.credentials ?? []).map((c: string) => path.basename(c)),
    );

    for (const item of items) {
      if (ignoreRoots.has(item) || credBasenames.has(item)) continue;

      const localPath = path.join(configDir, item);
      const repoPath = path.join(agentRepoDir, item);

      const localExists = existsAsRealFileOrDir(localPath);
      const repoExists = fs.existsSync(repoPath);

      if (localExists && !repoExists) {
        diffs.push({
          agentId: def.id,
          agentName: def.name,
          item,
          localPath,
          repoPath,
          status: "local-only",
        });
      } else if (!localExists && repoExists) {
        diffs.push({
          agentId: def.id,
          agentName: def.name,
          item,
          localPath,
          repoPath,
          status: "repo-only",
        });
      } else if (localExists && repoExists && hasContentDifference(localPath, repoPath)) {
        diffs.push({
          agentId: def.id,
          agentName: def.name,
          item,
          localPath,
          repoPath,
          status: "diverged",
        });
      }
    }
  }

  return diffs;
}

/**
 * Copy a local portable file/dir into the repo.
 */
export function copyLocalToRepo(diff: SyncDiff): void {
  fs.mkdirSync(path.dirname(diff.repoPath), { recursive: true });
  const stat = fs.statSync(diff.localPath);
  if (stat.isDirectory()) {
    fs.cpSync(diff.localPath, diff.repoPath, {
      recursive: true,
      dereference: true,
    });
  } else {
    fs.copyFileSync(diff.localPath, diff.repoPath);
  }
}

/** Check if a path exists as a real file/dir (not a symlink) */
function existsAsRealFileOrDir(p: string): boolean {
  try {
    const stat = fs.lstatSync(p);
    if (stat.isSymbolicLink()) return false;
    return true;
  } catch {
    return false;
  }
}

/** Compare file contents (shallow for dirs, full for files) */
function hasContentDifference(
  localPath: string,
  repoPath: string,
): boolean {
  const localStat = fs.statSync(localPath);
  const repoStat = fs.statSync(repoPath);

  if (localStat.isDirectory() && repoStat.isDirectory()) {
    const localEntries = fs.readdirSync(localPath).sort();
    const repoEntries = fs.readdirSync(repoPath).sort();
    return JSON.stringify(localEntries) !== JSON.stringify(repoEntries);
  }

  if (localStat.isFile() && repoStat.isFile()) {
    if (localStat.size !== repoStat.size) return true;
    const localContent = fs.readFileSync(localPath);
    const repoContent = fs.readFileSync(repoPath);
    return !localContent.equals(repoContent);
  }

  return true;
}
