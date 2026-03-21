/**
 * Reverse-import MCP configs from native agent formats to normalized format.
 * The inverse of transformer.ts — reads per-agent MCP configs and converts
 * them back to the canonical NormalizedMCPConfig used by agents-anywhere.
 */

import * as fs from "node:fs";
import path from "node:path";
import * as TOML from "smol-toml";
import type { AgentDefinition, MCPConfig } from "../schemas/agent-schema.js";
import { debug } from "../utils/output.js";
import type { NormalizedMCPConfig, NormalizedServer, EnvRef } from "./types.js";
import { expandPath, getPlatformPath } from "../utils/paths.js";

/** Result of importing MCP config from a single agent */
export interface ImportResult {
  agentId: string;
  agentName: string;
  servers: Record<string, NormalizedServer>;
  sourcePath: string;
}

/** Result of merging imports from multiple agents */
export interface MergedImportResult {
  config: NormalizedMCPConfig;
  /** For each server name, which agent it came from */
  sources: Record<string, string>;
  /** Conflicts: server name appeared in multiple agents */
  conflicts: Array<{
    serverName: string;
    agents: string[];
    kept: string;
  }>;
}

/**
 * Import MCP servers from a single agent's native config file.
 * Returns null if the config file doesn't exist or can't be parsed.
 */
export function importFromAgent(agentDef: AgentDefinition): ImportResult | null {
  const configDir = expandPath(getPlatformPath(agentDef.configDir));
  const configPath = path.join(configDir, agentDef.mcp.configPath);

  if (!fs.existsSync(configPath)) return null;

  const nativeServers = readNativeConfig(configPath, agentDef.mcp);
  if (!nativeServers) return null;

  const servers: Record<string, NormalizedServer> = {};
  for (const [name, serverData] of Object.entries(nativeServers)) {
    const normalized = reverseTransformServer(
      serverData as Record<string, unknown>,
      agentDef.mcp,
    );
    if (normalized) {
      servers[name] = normalized;
    }
  }

  if (Object.keys(servers).length === 0) return null;

  return {
    agentId: agentDef.id,
    agentName: agentDef.name,
    servers,
    sourcePath: configPath,
  };
}

/**
 * Import MCP servers from all provided agents and merge them.
 * Deduplication: same server name → keep the version with more configuration.
 */
export function importAndMergeAll(
  agents: AgentDefinition[],
): MergedImportResult {
  const allImports: ImportResult[] = [];
  for (const agent of agents) {
    const result = importFromAgent(agent);
    if (result) {
      allImports.push(result);
    }
  }

  const merged: Record<string, NormalizedServer> = {};
  const sources: Record<string, string> = {};
  const conflictAgents: Record<string, string[]> = {};

  for (const imp of allImports) {
    for (const [name, server] of Object.entries(imp.servers)) {
      if (merged[name]) {
        // Track all agents that define this server
        if (!conflictAgents[name]) {
          conflictAgents[name] = [sources[name]];
        }
        conflictAgents[name].push(imp.agentId);

        const existingScore = serverScore(merged[name]);
        const newScore = serverScore(server);

        if (newScore > existingScore) {
          merged[name] = server;
          sources[name] = imp.agentId;
        }
      } else {
        merged[name] = server;
        sources[name] = imp.agentId;
      }
    }
  }

  // Build conflict records (one per server, listing all involved agents)
  const conflicts: MergedImportResult["conflicts"] = [];
  for (const [serverName, agents] of Object.entries(conflictAgents)) {
    conflicts.push({ serverName, agents, kept: sources[serverName] });
  }

  return { config: { servers: merged }, sources, conflicts };
}

/** Read and parse native MCP config, returning the servers object */
function readNativeConfig(
  filePath: string,
  mcp: MCPConfig,
): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    let parsed: Record<string, unknown>;

    if (mcp.format === "toml") {
      parsed = TOML.parse(raw) as Record<string, unknown>;
    } else {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    }

    const servers = parsed[mcp.rootKey];
    if (!servers || typeof servers !== "object") return null;

    return servers as Record<string, unknown>;
  } catch (err) {
    debug(`Failed to parse native config ${filePath}: ${(err as Error).message}`);
    return null;
  }
}

/** Reverse-transform a single server from agent-specific to normalized format */
function reverseTransformServer(
  serverData: Record<string, unknown>,
  mcp: MCPConfig,
): NormalizedServer | null {
  const transport = detectTransport(serverData, mcp);
  if (!transport) return null;

  const server: NormalizedServer = { transport };

  if (transport === "stdio") {
    reverseStdioFields(server, serverData, mcp);
  } else {
    reverseHttpFields(server, serverData, mcp);
  }

  // Reverse env vars
  if (mcp.envVarStyle === "named") {
    const envVars = serverData[mcp.envKey];
    if (Array.isArray(envVars)) {
      server.env = reverseNamedEnvVars(envVars as string[]);
    }
    // Reverse bearer token
    const bearerVar = serverData.bearer_token_env_var;
    if (typeof bearerVar === "string") {
      server.headers = {
        Authorization: { $env: bearerVar, prefix: "Bearer " },
      };
    }
  } else {
    const envObj = serverData[mcp.envKey];
    if (envObj && typeof envObj === "object" && !Array.isArray(envObj)) {
      const reversed = reverseInlineEnvVars(
        envObj as Record<string, string>,
        mcp.envSyntax,
      );
      if (Object.keys(reversed).length > 0) {
        server.env = reversed;
      }
    }
    // Reverse headers
    const headers = serverData.headers;
    if (headers && typeof headers === "object" && !Array.isArray(headers)) {
      const reversedHeaders = reverseInlineHeaders(
        headers as Record<string, string>,
        mcp.envSyntax,
      );
      if (Object.keys(reversedHeaders).length > 0) {
        server.headers = reversedHeaders;
      }
    }
  }

  return server;
}

/** Detect transport type from agent-specific server data */
function detectTransport(
  serverData: Record<string, unknown>,
  mcp: MCPConfig,
): "stdio" | "http" | null {
  // Check each defined transport's type field
  for (const [transportType, config] of Object.entries(mcp.transports)) {
    if (!config?.typeField) continue;
    const value = serverData[config.typeField];
    if (value === config.typeValue) {
      return transportType as "stdio" | "http";
    }
  }

  // Fallback: infer from presence of command vs url
  if (serverData.command) return "stdio";

  // Check all known URL keys
  const httpConfig = mcp.transports.http;
  const urlKey = httpConfig?.urlKey ?? "url";
  if (serverData[urlKey] || serverData.url) return "http";

  return null;
}

/** Extract stdio-specific fields */
function reverseStdioFields(
  server: NormalizedServer,
  serverData: Record<string, unknown>,
  mcp: MCPConfig,
): void {
  if (mcp.commandType === "array" && Array.isArray(serverData.command)) {
    const arr = serverData.command as string[];
    server.command = arr[0];
    if (arr.length > 1) {
      server.args = arr.slice(1);
    }
  } else {
    if (typeof serverData.command === "string") {
      server.command = serverData.command;
    }
    if (Array.isArray(serverData.args) && serverData.args.length > 0) {
      server.args = serverData.args as string[];
    }
  }
}

/** Extract http-specific fields */
function reverseHttpFields(
  server: NormalizedServer,
  serverData: Record<string, unknown>,
  mcp: MCPConfig,
): void {
  const httpConfig = mcp.transports.http;
  const urlKey = httpConfig?.urlKey ?? "url";
  const url = serverData[urlKey] ?? serverData.url;
  if (typeof url === "string") {
    server.url = url;
  }
}

/**
 * Extract env var name from a value using the agent's env syntax.
 * e.g., envSyntax "${VAR}" + value "${GITHUB_TOKEN}" → "GITHUB_TOKEN"
 */
export function extractEnvVarName(
  value: string,
  envSyntax: string,
): string | null {
  const parts = envSyntax.split("VAR");
  if (parts.length !== 2) return null;
  const [prefix, suffix] = parts;

  if (value.startsWith(prefix) && value.endsWith(suffix)) {
    const varName = value.slice(
      prefix.length,
      suffix.length > 0 ? value.length - suffix.length : undefined,
    );
    if (varName.length > 0) return varName;
  }
  return null;
}

/**
 * Reverse an env-ref value that may have a prefix (e.g., "Bearer ${TOKEN}").
 * Returns the EnvRef with extracted var name and optional prefix.
 */
export function reverseEnvRef(
  value: string,
  envSyntax: string,
): EnvRef | null {
  // Try direct match first (no prefix)
  const direct = extractEnvVarName(value, envSyntax);
  if (direct) return { $env: direct };

  // Try to find the env syntax pattern within the value (prefix case)
  const parts = envSyntax.split("VAR");
  if (parts.length !== 2) return null;
  const [syntaxPrefix, syntaxSuffix] = parts;

  const idx = value.indexOf(syntaxPrefix);
  if (idx === -1) return null;

  const beforeSyntax = value.slice(0, idx);
  const afterPrefix = value.slice(idx + syntaxPrefix.length);

  let varName: string;
  if (syntaxSuffix.length > 0) {
    const suffixIdx = afterPrefix.indexOf(syntaxSuffix);
    if (suffixIdx === -1) return null;
    varName = afterPrefix.slice(0, suffixIdx);
  } else {
    varName = afterPrefix;
  }

  if (varName.length === 0) return null;

  const ref: EnvRef = { $env: varName };
  if (beforeSyntax) {
    ref.prefix = beforeSyntax;
  }
  return ref;
}

/** Reverse named env var style (Codex): array of var names → Record<string, EnvRef> */
function reverseNamedEnvVars(envVars: string[]): Record<string, EnvRef> {
  const result: Record<string, EnvRef> = {};
  for (const name of envVars) {
    result[name] = { $env: name };
  }
  return result;
}

/** Reverse inline env vars: { KEY: "${KEY}" } → { KEY: { $env: "KEY" } } */
function reverseInlineEnvVars(
  env: Record<string, string>,
  envSyntax: string,
): Record<string, EnvRef> {
  const result: Record<string, EnvRef> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== "string") continue;
    const ref = reverseEnvRef(value, envSyntax);
    if (ref) {
      result[key] = ref;
    }
  }
  return result;
}

/** Reverse inline headers, detecting prefixes like "Bearer " */
function reverseInlineHeaders(
  headers: Record<string, string>,
  envSyntax: string,
): Record<string, EnvRef> {
  const result: Record<string, EnvRef> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value !== "string") continue;
    const ref = reverseEnvRef(value, envSyntax);
    if (ref) {
      result[key] = ref;
    }
  }
  return result;
}

/** Score a server's richness for merge conflict resolution */
function serverScore(server: NormalizedServer): number {
  let score = 0;
  if (server.command) score++;
  if (server.url) score++;
  if (server.args) score += server.args.length;
  if (server.env) score += Object.keys(server.env).length;
  if (server.headers) score += Object.keys(server.headers).length;
  return score;
}
