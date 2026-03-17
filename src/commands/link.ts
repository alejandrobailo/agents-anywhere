/**
 * agentsync link [agent] — link agent configs from central repo to agent config dirs.
 */

import * as fs from "node:fs";
import path from "node:path";
import { linkAgent } from "../core/linker.js";
import { loadAgentById, loadAllAgentDefinitions } from "../core/schema-loader.js";
import { heading, success, info, warn, error, dim } from "../utils/output.js";
import { loadManifest, type Manifest } from "../utils/manifest.js";

export async function linkCommand(agentId?: string): Promise<void> {
  const manifest = loadManifest();
  if (!manifest) return;

  const repoDir = manifest.repoDir;

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
      warn(`Agent "${agentId}" is not enabled in agentsync.json`);
      return;
    }
    linkSingleAgent(agentDef.id, agentDef.name, repoDir);
  } else {
    // Link all enabled agents
    heading("Linking agent configs...");
    const enabledIds = Object.entries(manifest.agents)
      .filter(([, v]) => v.enabled)
      .map(([id]) => id);

    if (enabledIds.length === 0) {
      warn("No agents enabled in agentsync.json");
      return;
    }

    for (const id of enabledIds) {
      const agentDef = loadAgentById(id);
      if (!agentDef) {
        warn(`Agent "${id}" in manifest but no definition found — skipping`);
        continue;
      }
      linkSingleAgent(agentDef.id, agentDef.name, repoDir);
    }
  }
}

function linkSingleAgent(id: string, name: string, repoDir: string): void {
  const agentDef = loadAgentById(id);
  if (!agentDef) return;

  const results = linkAgent(agentDef, repoDir);

  if (results.length === 0) {
    info(`${name} — no portable files found in repo`);
    return;
  }

  const linked = results.filter((r) => r.action === "linked" || r.action === "backed-up-and-linked");
  const skipped = results.filter((r) => r.action === "skipped");

  const items = results.map((r) => r.item).join(", ");

  if (linked.length > 0) {
    success(`${name} — ${items} linked`);
  } else if (skipped.length === results.length) {
    info(`${name} — already linked ${dim("(skipped)")}`);
  }

  for (const r of results) {
    if (r.action === "backed-up-and-linked") {
      info(`  backed up existing ${r.item}`);
    }
  }
}
