/**
 * agents-anywhere unlink [agent] — unlink agent configs and restore backups.
 */

import { unlinkAgent } from "../core/linker.js";
import { loadAgentById, loadAllAgentDefinitions } from "../core/schema-loader.js";
import { heading, success, info, warn, error } from "../utils/output.js";
import { loadManifest } from "../utils/manifest.js";
import type { AgentDefinition } from "../schemas/agent-schema.js";

export async function unlinkCommand(agentId?: string, options: { dryRun?: boolean } = {}): Promise<void> {
  const manifest = loadManifest();
  if (!manifest) return;

  const repoDir = manifest.repoDir;
  const dryRun = options.dryRun ?? false;
  const prefix = dryRun ? "[dry-run] " : "";

  if (agentId) {
    const agentDef = loadAgentById(agentId);
    if (!agentDef) {
      error(`Unknown agent: ${agentId}`);
      const all = loadAllAgentDefinitions();
      info("Known agents: " + all.map((a) => a.id).join(", "));
      return;
    }
    unlinkSingleAgent(agentDef, repoDir, dryRun, prefix);
  } else {
    heading(`${prefix}Unlinking agent configs...`);
    const agentIds = Object.keys(manifest.agents);

    if (agentIds.length === 0) {
      warn("No agents in agents-anywhere.json");
      return;
    }

    for (const id of agentIds) {
      const agentDef = loadAgentById(id);
      if (!agentDef) {
        warn(`Agent "${id}" in manifest but no definition found — skipping`);
        continue;
      }
      unlinkSingleAgent(agentDef, repoDir, dryRun, prefix);
    }
  }
}

function unlinkSingleAgent(agentDef: AgentDefinition, repoDir: string, dryRun: boolean, prefix: string): void {
  const results = unlinkAgent(agentDef, repoDir, dryRun);

  const unlinked = results.filter((r) => r.action === "unlinked" || r.action === "restored");
  const skipped = results.filter((r) => r.action === "skipped");

  if (unlinked.length > 0) {
    const items = unlinked.map((r) => r.item).join(", ");
    success(`${prefix}${agentDef.name} — ${items} unlinked`);
  } else if (skipped.length === results.length) {
    info(`${prefix}${agentDef.name} — nothing to unlink`);
  }

  for (const r of results) {
    if (r.action === "restored") {
      info(`${prefix}  restored backup for ${r.item}`);
    }
  }
}
