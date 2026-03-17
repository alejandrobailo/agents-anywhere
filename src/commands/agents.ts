/**
 * agentsync agents — list all known agents with install and link status.
 */

import { detectAgents } from "../core/detector.js";
import { getStatus } from "../core/linker.js";
import { heading, bold, statusBadge, dim } from "../utils/output.js";
import { loadManifest } from "../utils/manifest.js";

export async function agentsCommand(): Promise<void> {
  const manifest = loadManifest();
  const repoDir = manifest?.repoDir;

  const agents = detectAgents();

  heading("Known AI coding agents");
  console.log();

  for (const agent of agents) {
    const id = agent.definition.id;
    const name = agent.definition.name;
    const installStatus = agent.installed ? statusBadge("installed") : statusBadge("not installed");

    let linkInfo = "";
    if (agent.installed && repoDir && manifest?.agents[id]?.enabled) {
      const statuses = getStatus(agent.definition, repoDir);
      const linkedCount = statuses.filter((s) => s.status === "linked").length;
      const total = statuses.length;
      if (linkedCount === total && total > 0) {
        linkInfo = `  ${statusBadge("linked")}`;
      } else if (linkedCount > 0) {
        linkInfo = `  ${dim(`${linkedCount}/${total} linked`)}`;
      }
    }

    console.log(`  ${bold(name.padEnd(16))} ${installStatus}${linkInfo}`);
    console.log(`  ${dim(agent.configDir)}`);
    console.log();
  }
}
