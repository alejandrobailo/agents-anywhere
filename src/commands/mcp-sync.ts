/**
 * agents-anywhere mcp sync — read mcp.json from repo, transform for each enabled agent,
 * write to agent config dirs, show summary.
 */

import path from "node:path";
import { parseMCPConfig } from "../mcp/parser.js";
import { transformForAgent } from "../mcp/transformer.js";
import { writeJSON, mergeJSON, writeTOML } from "../mcp/writer.js";
import { loadAgentById } from "../core/schema-loader.js";
import { loadManifest } from "../utils/manifest.js";
import { expandPath, getPlatformPath } from "../utils/paths.js";
import { heading, success, warn, error, dim } from "../utils/output.js";

export async function mcpSyncCommand(options: { dryRun?: boolean } = {}): Promise<void> {
  const manifest = loadManifest();
  if (!manifest) return;

  const dryRun = options.dryRun ?? false;
  const prefix = dryRun ? "[dry-run] " : "";
  const mcpPath = path.join(manifest.repoDir, "mcp.json");

  let config;
  try {
    config = parseMCPConfig(mcpPath);
  } catch (err) {
    error(`Failed to parse mcp.json: ${(err as Error).message}`);
    return;
  }

  const serverCount = Object.keys(config.servers).length;
  if (serverCount === 0) {
    warn("No servers defined in mcp.json. Use `agents-anywhere mcp add` to add one.");
    return;
  }

  heading(`${prefix}Syncing MCP config to agents...`);

  const enabledIds = Object.entries(manifest.agents)
    .filter(([, v]) => v.enabled)
    .map(([id]) => id);

  if (enabledIds.length === 0) {
    warn("No agents enabled in agents-anywhere.json");
    return;
  }

  let synced = 0;
  for (const id of enabledIds) {
    const agentDef = loadAgentById(id);
    if (!agentDef) {
      warn(`Agent "${id}" in manifest but no definition found — skipping`);
      continue;
    }

    const result = transformForAgent(config, agentDef);
    const configDir = expandPath(getPlatformPath(agentDef.configDir));
    const targetPath = path.join(configDir, agentDef.mcp.configPath);

    if (!dryRun) {
      if (result.format === "toml") {
        writeTOML(targetPath, result.rootKey, result.servers);
      } else if (agentDef.mcp.writeMode === "merge") {
        mergeJSON(targetPath, result.rootKey, result.servers);
      } else {
        writeJSON(targetPath, result.rootKey, result.servers);
      }
    }

    success(`${prefix}${agentDef.name} — ${dryRun ? "would write" : "wrote"} ${dim(targetPath)}`);
    synced++;
  }

  console.log(`\n${prefix}Synced ${serverCount} server(s) to ${synced} agent(s).`);
}
