/**
 * agents-anywhere link [agent] — link agent configs from central repo to agent config dirs.
 */

import { linkAgent } from "../core/linker.js";
import { loadAgentById, loadAllAgentDefinitions } from "../core/schema-loader.js";
import { heading, success, info, warn, error, dim } from "../utils/output.js";
import { loadManifest } from "../utils/manifest.js";
import type { AgentDefinition } from "../schemas/agent-schema.js";

export async function linkCommand(agentId?: string, options: { dryRun?: boolean } = {}): Promise<void> {
  const manifest = loadManifest();
  if (!manifest) return;

  const repoDir = manifest.repoDir;
  const dryRun = options.dryRun ?? false;
  const prefix = dryRun ? "[dry-run] " : "";

  if (agentId) {
    // Link a specific agent
    const agentDef = loadAgentById(agentId);
    if (!agentDef) {
      error(`Unknown agent: ${agentId}`);
      const all = loadAllAgentDefinitions();
      info("Known agents: " + all.map((a) => a.id).join(", "));
      return;
    }
    if (!manifest.agents[agentId]?.enabled) {
      warn(`Agent "${agentId}" is not enabled in agents-anywhere.json`);
      return;
    }
    linkSingleAgent(agentDef, repoDir, dryRun, prefix);
  } else {
    // Link all enabled agents
    heading(`${prefix}Linking agent configs...`);
    const enabledIds = Object.entries(manifest.agents)
      .filter(([, v]) => v.enabled)
      .map(([id]) => id);

    if (enabledIds.length === 0) {
      warn("No agents enabled in agents-anywhere.json");
      return;
    }

    for (const id of enabledIds) {
      const agentDef = loadAgentById(id);
      if (!agentDef) {
        warn(`Agent "${id}" in manifest but no definition found — skipping`);
        continue;
      }
      linkSingleAgent(agentDef, repoDir, dryRun, prefix);
    }
  }
}

function linkSingleAgent(agentDef: AgentDefinition, repoDir: string, dryRun: boolean, prefix: string): void {
  const results = linkAgent(agentDef, repoDir, dryRun);

  if (results.length === 0) {
    info(`${prefix}${agentDef.name} — no portable files found in repo`);
    return;
  }

  const linked = results.filter((r) => r.action === "linked" || r.action === "backed-up-and-linked");
  const skipped = results.filter((r) => r.action === "skipped");

  const items = results.map((r) => r.item).join(", ");

  if (linked.length > 0) {
    success(`${prefix}${agentDef.name} — ${items} linked`);
  } else if (results.length > 0 && skipped.length === results.length) {
    info(`${prefix}${agentDef.name} — already linked ${dim("(skipped)")}`);
  }

  for (const r of results) {
    if (r.action === "backed-up-and-linked") {
      info(`${prefix}  backed up existing ${r.item}`);
    }
  }
}
