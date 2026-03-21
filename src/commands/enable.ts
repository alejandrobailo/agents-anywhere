/**
 * agents-anywhere enable — enable an agent in the manifest.
 */

import {
  loadAgentById,
  loadAllAgentDefinitions,
} from "../core/schema-loader.js";
import { success, error, info } from "../utils/output.js";
import { loadManifest, saveManifest } from "../utils/manifest.js";

export async function enableCommand(agentId: string): Promise<void> {
  const manifest = loadManifest();
  if (!manifest) return;

  const agentDef = await loadAgentById(agentId);
  if (!agentDef) {
    error(`Unknown agent: ${agentId}`);
    const all = await loadAllAgentDefinitions();
    info("Known agents: " + all.map((a) => a.id).join(", "));
    return;
  }

  const entry = manifest.agents[agentId];
  if (!entry) {
    manifest.agents[agentId] = { enabled: true, name: agentDef.name };
    saveManifest(manifest);
    success(`Enabled ${agentDef.name} (added to manifest)`);
    return;
  }

  if (entry.enabled) {
    info(`${agentDef.name} is already enabled`);
    return;
  }

  entry.enabled = true;
  saveManifest(manifest);
  success(`Enabled ${agentDef.name}`);
}
