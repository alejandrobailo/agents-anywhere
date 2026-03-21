/**
 * agents-anywhere push — stage, commit, and push config changes to remote.
 */

import { simpleGit } from "simple-git";
import { loadManifest } from "../utils/manifest.js";
import { heading, success, error, info, warn } from "../utils/output.js";

export async function pushCommand(): Promise<void> {
  const manifest = loadManifest();
  if (!manifest) return;

  const git = simpleGit(manifest.repoDir);

  const status = await git.status();
  if (status.isClean()) {
    info("No changes to push.");
    return;
  }

  heading("Pushing config changes...");

  try {
    await git.add("-A");

    const summary = await git.commit("Update agent configs");
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
