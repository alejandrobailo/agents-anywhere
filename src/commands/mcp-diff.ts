/**
 * agentsync mcp diff — preview what `mcp sync` would change for each agent.
 *
 * Reads mcp.json, transforms for each enabled agent, compares against
 * the existing config on disk, and shows a colored per-agent diff.
 */

import * as fs from "node:fs";
import path from "node:path";
import * as TOML from "smol-toml";
import { parseMCPConfig } from "../mcp/parser.js";
import { transformForAgent } from "../mcp/transformer.js";
import { loadAgentById } from "../core/schema-loader.js";
import { loadManifest } from "../utils/manifest.js";
import { expandPath, getPlatformPath } from "../utils/paths.js";
import { heading, success, warn, error, dim, green, red, yellow, bold } from "../utils/output.js";
import type { AgentDefinition } from "../schemas/agent-schema.js";

export interface ServerDiff {
  added: string[];
  removed: string[];
  changed: string[];
  unchanged: string[];
}

/**
 * Read the existing MCP servers from an agent's config file.
 * Returns the server entries under the agent's root key, or null if the file doesn't exist.
 */
function readExistingServers(
  agentDef: AgentDefinition,
  targetPath: string,
): Record<string, Record<string, unknown>> | null {
  if (!fs.existsSync(targetPath)) {
    return null;
  }

  const raw = fs.readFileSync(targetPath, "utf-8");
  const format = agentDef.mcp.format ?? "json";

  if (format === "toml") {
    const parsed = TOML.parse(raw) as Record<string, unknown>;
    const section = parsed.mcp_servers;
    if (!section || typeof section !== "object") return {};
    return section as Record<string, Record<string, unknown>>;
  }

  const parsed = JSON.parse(raw);
  const rootKey = agentDef.mcp.rootKey;
  const section = parsed[rootKey];
  if (!section || typeof section !== "object") return {};
  return section as Record<string, Record<string, unknown>>;
}

/**
 * Compare two server maps and return which servers are added, removed, changed, or unchanged.
 */
export function diffServers(
  existing: Record<string, Record<string, unknown>> | null,
  incoming: Record<string, Record<string, unknown>>,
): ServerDiff {
  const diff: ServerDiff = { added: [], removed: [], changed: [], unchanged: [] };

  if (existing === null) {
    // No existing file — everything is new
    diff.added = Object.keys(incoming);
    return diff;
  }

  const existingNames = new Set(Object.keys(existing));
  const incomingNames = new Set(Object.keys(incoming));

  for (const name of incomingNames) {
    if (!existingNames.has(name)) {
      diff.added.push(name);
    } else {
      const existingStr = JSON.stringify(existing[name], null, 2);
      const incomingStr = JSON.stringify(incoming[name], null, 2);
      if (existingStr === incomingStr) {
        diff.unchanged.push(name);
      } else {
        diff.changed.push(name);
      }
    }
  }

  for (const name of existingNames) {
    if (!incomingNames.has(name)) {
      diff.removed.push(name);
    }
  }

  return diff;
}

export async function mcpDiffCommand(): Promise<void> {
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

  const serverCount = Object.keys(config.servers).length;
  if (serverCount === 0) {
    warn("No servers defined in mcp.json. Use `agentsync mcp add` to add one.");
    return;
  }

  const enabledIds = Object.entries(manifest.agents)
    .filter(([, v]) => v.enabled)
    .map(([id]) => id);

  if (enabledIds.length === 0) {
    warn("No agents enabled in agentsync.json");
    return;
  }

  heading("MCP diff — previewing sync changes...");

  let anyChanges = false;

  for (const id of enabledIds) {
    const agentDef = loadAgentById(id);
    if (!agentDef) {
      warn(`Agent "${id}" in manifest but no definition found — skipping`);
      continue;
    }

    const result = transformForAgent(config, agentDef);
    const configDir = expandPath(getPlatformPath(agentDef.configDir));
    const targetPath = path.join(configDir, agentDef.mcp.configPath);

    const existing = readExistingServers(agentDef, targetPath);
    const diff = diffServers(existing, result.servers);

    const hasChanges = diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;

    if (!hasChanges && existing !== null) {
      success(`${agentDef.name} — ${dim("up to date")}`);
      continue;
    }

    anyChanges = true;

    if (existing === null) {
      console.log(`\n  ${bold(agentDef.name)} ${dim(`(${targetPath})`)}`);
      console.log(`    ${dim("File does not exist — will be created")}`);
    } else {
      console.log(`\n  ${bold(agentDef.name)} ${dim(`(${targetPath})`)}`);
    }

    for (const name of diff.added) {
      console.log(`    ${green("+ " + name)}`);
    }
    for (const name of diff.removed) {
      console.log(`    ${red("- " + name)}`);
    }
    for (const name of diff.changed) {
      console.log(`    ${yellow("~ " + name)}`);
    }
  }

  console.log();
  if (!anyChanges) {
    success("All agents up to date");
  } else {
    console.log(`Run ${bold("agentsync mcp sync")} to apply these changes.`);
  }
}
