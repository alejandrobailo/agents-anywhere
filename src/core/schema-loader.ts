import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { AgentDefinition } from "../schemas/agent-schema.js";

/**
 * Returns the path to the bundled agents/ directory.
 * In development, this is at the project root.
 * When published, agents/ is copied to dist/agents/.
 */
function getAgentsDir(): string {
  // Walk up from this file to find the agents/ directory.
  // In dev: src/core/schema-loader.ts -> ../../agents
  // In dist: dist/core/schema-loader.js -> ../../agents (if copied to root)
  //          dist/agents/ (if copied alongside dist)
  const candidates = [
    path.resolve(__dirname, "../../agents"),
    path.resolve(__dirname, "../agents"),
    path.resolve(__dirname, "agents"),
  ];

  for (const candidate of candidates) {
    try {
      readdirSync(candidate);
      return candidate;
    } catch {
      // try next
    }
  }

  throw new Error(
    "Could not find agents/ directory. Ensure agent definition JSON files are bundled.",
  );
}

/**
 * Load a single agent definition from a JSON file.
 */
export function loadAgentDefinition(filePath: string): AgentDefinition {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw) as AgentDefinition;
  validateAgentDefinition(parsed, filePath);
  return parsed;
}

/**
 * Load all agent definitions from the bundled agents/ directory.
 * Results are cached after first load.
 */
let _cache: AgentDefinition[] | null = null;

export function loadAllAgentDefinitions(): AgentDefinition[] {
  if (_cache) return _cache;
  const agentsDir = getAgentsDir();
  const files = readdirSync(agentsDir).filter((f) => f.endsWith(".json"));
  _cache = files.map((file) => loadAgentDefinition(path.join(agentsDir, file)));
  return _cache;
}

/**
 * Load a specific agent definition by ID.
 */
export function loadAgentById(id: string): AgentDefinition | undefined {
  const all = loadAllAgentDefinitions();
  return all.find((agent) => agent.id === id);
}

/**
 * Validate that an agent definition has all required fields.
 */
function validateAgentDefinition(
  def: AgentDefinition,
  source: string,
): void {
  const required: (keyof AgentDefinition)[] = [
    "id",
    "name",
    "configDir",
    "detect",
    "portable",
    "ignore",
    "credentials",
    "instructions",
    "mcp",
  ];

  for (const field of required) {
    if (def[field] === undefined || def[field] === null) {
      throw new Error(
        `Agent definition ${source} is missing required field: ${field}`,
      );
    }
  }

  if (!def.configDir.darwin || !def.configDir.linux || !def.configDir.win32) {
    throw new Error(
      `Agent definition ${source} is missing platform paths in configDir`,
    );
  }

  if (!def.mcp.configPath || !def.mcp.rootKey || !def.mcp.envSyntax || !def.mcp.writeMode || !def.mcp.commandType) {
    throw new Error(
      `Agent definition ${source} is missing required MCP fields`,
    );
  }
}
