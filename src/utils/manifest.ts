/**
 * Load and validate the agents-anywhere.json manifest file.
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

const DEFAULT_REPO_DIR = path.join(os.homedir(), "agents-anywhere-config");

/**
 * Find and load the agents-anywhere.json manifest.
 * Looks in the current directory first, then the default location.
 * Returns null and prints an error if not found.
 */
export function loadManifest(): Manifest | null {
  const candidates = [
    path.join(process.cwd(), "agents-anywhere.json"),
    path.join(DEFAULT_REPO_DIR, "agents-anywhere.json"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const raw = fs.readFileSync(candidate, "utf-8");
      let parsed: Manifest;
      try {
        parsed = JSON.parse(raw) as Manifest;
      } catch {
        error(`Invalid JSON in ${candidate}`);
        return null;
      }
      // Always derive repoDir from manifest location to prevent path traversal
      parsed.repoDir = path.dirname(candidate);
      return parsed;
    }
  }

  error("No agents-anywhere.json found. Run `agents-anywhere init` first.");
  info(`Looked in: ${candidates.join(", ")}`);
  return null;
}
