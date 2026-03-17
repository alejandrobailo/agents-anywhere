/**
 * agentsync status — show link status for all agents and their config files.
 */

import { getStatus } from "../core/linker.js";
import { loadAgentById } from "../core/schema-loader.js";
import { heading, warn, bold, statusBadge, table } from "../utils/output.js";
import { loadManifest } from "../utils/manifest.js";

export async function statusCommand(): Promise<void> {
  const manifest = loadManifest();
  if (!manifest) return;

  const repoDir = manifest.repoDir;
  const agentIds = Object.keys(manifest.agents);

  if (agentIds.length === 0) {
    warn("No agents in agentsync.json");
    return;
  }

  heading("Agent link status");

  for (const id of agentIds) {
    const agentDef = loadAgentById(id);
    if (!agentDef) {
      warn(`Agent "${id}" — definition not found`);
      continue;
    }

    const statuses = getStatus(agentDef, repoDir);
    console.log(`\n  ${bold(agentDef.name)}`);

    const rows: Array<[string, string]> = statuses.map((s) => [
      s.item,
      statusBadge(s.status),
    ]);

    table(rows, 4);
  }

  console.log();
}
