/**
 * agents-anywhere pull — auto-commit local changes, then pull --rebase.
 * The post-merge hook auto-runs `agents-anywhere link && agents-anywhere mcp sync`.
 */

import { simpleGit } from "simple-git";
import { loadManifest } from "../utils/manifest.js";
import { heading, success, error, info } from "../utils/output.js";

export async function pullCommand(): Promise<void> {
  const manifest = loadManifest();
  if (!manifest) return;

  const git = simpleGit(manifest.repoDir);

  heading("Pulling config changes...");

  try {
    const remotes = await git.getRemotes();
    if (remotes.length === 0) {
      error(
        "No remote configured. Add one with: git remote add origin <url>",
      );
      return;
    }

    // Discard local changes before pulling — the remote repo is the
    // source of truth, and `link` will re-apply configs after pull.
    const status = await git.status();
    const dirty =
      status.modified.length > 0 ||
      status.not_added.length > 0 ||
      status.created.length > 0 ||
      status.deleted.length > 0;

    if (dirty) {
      await git.checkout(["."]); // reset tracked files
      await git.clean("f", ["-d"]); // remove untracked files/dirs
      info("Discarded local changes.");
    }

    const result = await git.pull();

    if (result.summary.changes === 0 && !dirty) {
      info("Already up to date.");
    } else {
      success(
        `Pulled ${result.summary.changes} change(s). Post-merge hook will re-link configs.`,
      );
    }
  } catch (err) {
    error(`Pull failed: ${(err as Error).message}`);
  }
}
