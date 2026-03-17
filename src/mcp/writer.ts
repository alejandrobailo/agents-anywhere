/**
 * Write transformed MCP configs to each agent's expected location and format.
 *
 * - writeJSON: standalone JSON file (Claude Code, Cursor, Windsurf)
 * - writeTOML: merge into existing TOML file (Codex)
 * - mergeJSON: merge into existing JSON file (Gemini, OpenCode)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as TOML from "smol-toml";

/** Ensure parent directory exists before writing */
function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Write a standalone JSON MCP config file.
 * Overwrites the file entirely with { [rootKey]: servers }.
 * Used for agents like Claude Code where MCP has its own file.
 */
export function writeJSON(
  filePath: string,
  rootKey: string,
  servers: Record<string, Record<string, unknown>>,
): void {
  ensureDir(filePath);
  const content = { [rootKey]: servers };
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + "\n", "utf-8");
}

/**
 * Merge MCP servers into an existing JSON file without overwriting non-MCP keys.
 * If the file doesn't exist, creates it with just the MCP key.
 * Used for agents like Gemini (settings.json) and OpenCode (opencode.json).
 */
export function mergeJSON(
  filePath: string,
  key: string,
  servers: Record<string, Record<string, unknown>>,
): void {
  ensureDir(filePath);

  let existing: Record<string, unknown> = {};
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, "utf-8");
    existing = JSON.parse(raw);
  }

  existing[key] = servers;
  fs.writeFileSync(
    filePath,
    JSON.stringify(existing, null, 2) + "\n",
    "utf-8",
  );
}

/**
 * Merge MCP servers into an existing TOML config file.
 * Replaces the [mcp_servers] section while preserving all other keys.
 * If the file doesn't exist, creates it with just the MCP section.
 * Used for Codex (config.toml).
 */
export function writeTOML(
  filePath: string,
  servers: Record<string, Record<string, unknown>>,
): void {
  ensureDir(filePath);

  let existing: Record<string, unknown> = {};
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, "utf-8");
    existing = TOML.parse(raw) as Record<string, unknown>;
  }

  existing.mcp_servers = servers;
  fs.writeFileSync(filePath, TOML.stringify(existing) + "\n", "utf-8");
}
