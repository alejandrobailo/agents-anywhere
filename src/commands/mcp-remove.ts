/**
 * agents-anywhere mcp remove — remove an MCP server from mcp.json.
 */

import * as fs from "node:fs";
import path from "node:path";
import { parseMCPConfig } from "../mcp/parser.js";
import { loadManifest } from "../utils/manifest.js";
import { success, error, warn, info } from "../utils/output.js";

export async function mcpRemoveCommand(name: string): Promise<void> {
  const manifest = loadManifest();
  if (!manifest) return;

  const mcpPath = path.join(manifest.repoDir, "mcp.json");

  let config;
  try {
    config = parseMCPConfig(mcpPath);
  } catch (err) {
    error(`Failed to parse mcp.json: ${(err as Error).message}`);
    return;
  }

  if (!config.servers[name]) {
    warn(`Server "${name}" not found in mcp.json`);
    return;
  }

  delete config.servers[name];
  fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  success(`Removed server "${name}" from mcp.json`);
  info("Run `agents-anywhere mcp sync` to update per-agent configs.");
}
