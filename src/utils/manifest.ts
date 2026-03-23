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
  /** Derived at runtime from manifest file location; not persisted to disk. */
  repoDir: string;
  primaryAgent?: string;
  agents: Record<string, ManifestAgent>;
}

const DEFAULT_REPO_DIR = path.join(os.homedir(), "agents-anywhere-config");

/** Validate that parsed JSON has the expected manifest shape */
function validateManifest(
  data: unknown,
  filePath: string,
): Manifest | null {
  if (typeof data !== "object" || data === null) {
    error(`Invalid manifest in ${filePath}: expected an object`);
    return null;
  }
  const obj = data as Record<string, unknown>;

  if (typeof obj.version !== "string") {
    error(`Invalid manifest in ${filePath}: "version" must be a string`);
    return null;
  }

  if (typeof obj.agents !== "object" || obj.agents === null || Array.isArray(obj.agents)) {
    error(`Invalid manifest in ${filePath}: "agents" must be an object`);
    return null;
  }

  for (const [key, value] of Object.entries(
    obj.agents as Record<string, unknown>,
  )) {
    if (typeof value !== "object" || value === null) {
      error(
        `Invalid manifest in ${filePath}: agent "${key}" must be an object`,
      );
      return null;
    }
    const agent = value as Record<string, unknown>;
    if (typeof agent.enabled !== "boolean") {
      error(
        `Invalid manifest in ${filePath}: agent "${key}.enabled" must be a boolean`,
      );
      return null;
    }
    if (typeof agent.name !== "string") {
      error(
        `Invalid manifest in ${filePath}: agent "${key}.name" must be a string`,
      );
      return null;
    }
  }

  return data as Manifest;
}

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
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        error(`Invalid JSON in ${candidate}`);
        return null;
      }

      const manifest = validateManifest(parsed, candidate);
      if (!manifest) return null;

      // Always derive repoDir from manifest location to prevent path traversal
      manifest.repoDir = path.dirname(candidate);
      return manifest;
    }
  }

  error("No agents-anywhere.json found. Run `agents-anywhere init` first.");
  info(`Looked in: ${candidates.join(", ")}`);
  return null;
}

/** Save the manifest back to disk, stripping device-specific repoDir */
export function saveManifest(manifest: Manifest): void {
  const filePath = path.join(manifest.repoDir, "agents-anywhere.json");
  const { repoDir: _, ...persistable } = manifest;
  fs.writeFileSync(filePath, JSON.stringify(persistable, null, 2) + "\n", "utf-8");
}
