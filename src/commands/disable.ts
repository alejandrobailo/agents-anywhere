/**
 * agents-anywhere disable — disable an agent in the manifest.
 */

import {
  loadAgentById,
  loadAllAgentDefinitions,
} from "../core/schema-loader.js";
import { success, error, info } from "../utils/output.js";
import { loadManifest, saveManifest } from "../utils/manifest.js";

export async function disableCommand(agentId: string): Promise<void> {
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
    error(`Agent "${agentId}" is not in the manifest. Run \`agents-anywhere init\` first.`);
    return;
  }

  if (!entry.enabled) {
    info(`${agentDef.name} is already disabled`);
    return;
  }

  entry.enabled = false;
  saveManifest(manifest);
  success(`Disabled ${agentDef.name}`);
}
