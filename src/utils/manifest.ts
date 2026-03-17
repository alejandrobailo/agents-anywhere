/**
 * Load and validate the agentsync.json manifest file.
 * Searches current directory and default location.
 */

import * as fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { error, info } from "./output.js";

export interface ManifestAgent {
  enabled: boolean;
  name: string;
}

export interface Manifest {
  version: string;
  repoDir: string;
  agents: Record<string, ManifestAgent>;
}

const DEFAULT_REPO_DIR = path.join(os.homedir(), "agentsync-config");

/**
 * Find and load the agentsync.json manifest.
 * Looks in the current directory first, then the default location.
 * Returns null and prints an error if not found.
 */
export function loadManifest(): Manifest | null {
  const candidates = [
    path.join(process.cwd(), "agentsync.json"),
    path.join(DEFAULT_REPO_DIR, "agentsync.json"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const raw = fs.readFileSync(candidate, "utf-8");
      const parsed = JSON.parse(raw) as Manifest;
      // Ensure repoDir is set (derive from manifest location if missing)
      if (!parsed.repoDir) {
        parsed.repoDir = path.dirname(candidate);
      }
      return parsed;
    }
  }

  error("No agentsync.json found. Run `agentsync init` first.");
  info(`Looked in: ${candidates.join(", ")}`);
  return null;
}
