/**
 * agents-anywhere pull — pull config changes from remote.
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

    const result = await git.pull();

    if (result.summary.changes === 0) {
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
