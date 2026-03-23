/**
 * agents-anywhere push — sync local content, then stage, commit, and push.
 */

import confirm from "@inquirer/confirm";
import { simpleGit } from "simple-git";
import { loadManifest } from "../utils/manifest.js";
import { detectAgents } from "../core/detector.js";
import { diffLocalVsRepo, copyLocalToRepo } from "../core/sync.js";
import { heading, success, error, info, warn, green, yellow, red, cyan } from "../utils/output.js";

export interface PushOptions {
  dryRun?: boolean;
  message?: string;
}

export async function pushCommand(opts: PushOptions = {}): Promise<void> {
  const manifest = loadManifest();
  if (!manifest) return;

  // Sync local portable files to repo before committing
  try {
    const agents = detectAgents();
    const enabledInstalled = agents.filter(
      (a) => a.installed && manifest.agents[a.definition.id]?.enabled,
    );

    if (enabledInstalled.length > 0) {
      const diffs = diffLocalVsRepo(enabledInstalled, manifest.repoDir);
      const localOnly = diffs.filter((d) => d.status === "local-only");

      if (localOnly.length > 0) {
        heading("Local files not yet in repo:");
        for (const diff of localOnly) {
          info(`  ${diff.agentName} — ${diff.item}`);
        }

        let shouldCopy = true;
        if (process.stdin.isTTY) {
          shouldCopy = await confirm({
            message: "Copy these local files into the repo before pushing?",
            default: true,
          });
        }

        if (shouldCopy && !opts.dryRun) {
          for (const diff of localOnly) {
            copyLocalToRepo(diff);
            success(`Copied ${diff.agentName}/${diff.item}`);
          }
        }
      }
    }
  } catch {
    // If detection fails (e.g., agent definitions not found), continue with git-only push
  }

  // Git operations
  const git = simpleGit(manifest.repoDir);

  const status = await git.status();
  if (status.isClean()) {
    info("No changes to push.");
    return;
  }

  // Show what will be committed
  heading("Changes to commit:");

  const categories: Array<[string[], string, (s: string) => string]> = [
    [status.created, "new file", green],
    [status.not_added, "new file", green],
    [status.modified, "modified", yellow],
    [status.deleted, "deleted", red],
    [status.renamed.map((r) => `${r.from} → ${r.to}`), "renamed", cyan],
  ];

  for (const [files, label, colorFn] of categories) {
    for (const file of files) {
      console.log(`  ${colorFn(label)}:  ${file}`);
    }
  }

  console.log();

  if (opts.dryRun) {
    info("Dry run — no changes made.");
    return;
  }

  try {
    await git.add("-A");

    const commitMsg = opts.message ?? "Update agent configs";
    const summary = await git.commit(commitMsg);
    success(
      `Committed: ${summary.summary.changes} file(s) changed`,
    );
  } catch (err) {
    error(`Commit failed: ${(err as Error).message}`);
    return;
  }

  try {
    const remotes = await git.getRemotes();
    if (remotes.length === 0) {
      warn("No remote configured. Add one with: git remote add origin <url>");
      return;
    }

    await git.push();
    success("Pushed to remote.");
  } catch (err) {
    error(`Push failed: ${(err as Error).message}`);
  }
}
