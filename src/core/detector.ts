import { existsSync } from "node:fs";
import type { AgentDefinition } from "../schemas/agent-schema.js";
import { loadAllAgentDefinitions } from "./schema-loader.js";
import { expandPath, getPlatformPath } from "../utils/paths.js";

/** Result of detecting a single agent */
export interface DetectedAgent {
  definition: AgentDefinition;
  configDir: string;
  installed: boolean;
}

/**
 * Detect all known agents by checking filesystem for their config directories.
 */
export function detectAgents(): DetectedAgent[] {
  const definitions = loadAllAgentDefinitions();
  return definitions.map((def) => detectSingleAgent(def));
}

/**
 * Detect a single agent from its definition.
 */
export function detectSingleAgent(definition: AgentDefinition): DetectedAgent {
  const configDir = expandPath(getPlatformPath(definition.configDir));
  const installed = checkDetectRule(definition);

  return { definition, configDir, installed };
}

/**
 * Check if an agent is installed based on its detect rule.
 */
function checkDetectRule(definition: AgentDefinition): boolean {
  const { detect } = definition;

  switch (detect.type) {
    case "directory-exists":
      return existsSync(expandPath(detect.path));
    default:
      return false;
  }
}
