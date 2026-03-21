/**
 * agents-anywhere push — stage, commit, and push config changes to remote.
 */

import { simpleGit } from "simple-git";
import { loadManifest } from "../utils/manifest.js";
import { heading, success, error, info, warn, green, yellow, red, cyan } from "../utils/output.js";

export interface PushOptions {
  dryRun?: boolean;
  message?: string;
}

export async function pushCommand(opts: PushOptions = {}): Promise<void> {
  const manifest = loadManifest();
  if (!manifest) return;

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
