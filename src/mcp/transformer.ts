/**
 * Transform normalized MCP config into per-agent formats.
 *
 * Each agent has different conventions for:
 * - Root key (mcpServers, mcp_servers, mcp, servers)
 * - Env var syntax (${VAR}, {env:VAR}, ${env:VAR}, env_vars)
 * - Transport naming (stdio/http, local/remote)
 * - Command type (string vs array)
 * - Config format (JSON vs TOML)
 */

import type { AgentDefinition, MCPConfig } from "../schemas/agent-schema.js";
import type { EnvRef, NormalizedMCPConfig, NormalizedServer } from "./types.js";

/** Result of transforming for an agent */
export interface TransformResult {
  /** The root key to use in the config file */
  rootKey: string;
  /** The transformed server entries */
  servers: Record<string, Record<string, unknown>>;
  /** The config format (json or toml) */
  format: "json" | "toml";
}

/** Transform normalized MCP config for a specific agent */
export function transformForAgent(
  config: NormalizedMCPConfig,
  agentDef: AgentDefinition,
): TransformResult {
  const mcp = agentDef.mcp;
  const servers: Record<string, Record<string, unknown>> = {};

  for (const [name, server] of Object.entries(config.servers)) {
    servers[name] = transformServer(server, mcp);
  }

  return {
    rootKey: mcp.rootKey,
    servers,
    format: mcp.format ?? "json",
  };
}

function transformServer(
  server: NormalizedServer,
  mcp: MCPConfig,
): Record<string, unknown> {
  if (mcp.envVarStyle === "named") {
    return transformServerNamed(server, mcp);
  }
  return transformServerInline(server, mcp);
}

/** Transform for agents that use inline env var syntax (Claude Code, Cursor, Windsurf, etc.) */
function transformServerInline(
  server: NormalizedServer,
  mcp: MCPConfig,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Set transport type field
  const transportDef = mcp.transports[server.transport];
  if (transportDef) {
    result[transportDef.typeField] = transportDef.typeValue;
  }

  if (server.transport === "stdio") {
    result.command = server.command;
    if (server.args?.length) {
      result.args = server.args;
    }
  } else if (server.transport === "http") {
    result.url = server.url;
  }

  // Transform env vars
  if (server.env && Object.keys(server.env).length > 0) {
    const env: Record<string, string> = {};
    for (const [key, ref] of Object.entries(server.env)) {
      env[key] = resolveEnvRef(ref, mcp.envSyntax);
    }
    result[mcp.envKey] = env;
  }

  // Transform headers with env refs
  if (server.headers && Object.keys(server.headers).length > 0) {
    const headers: Record<string, string> = {};
    for (const [key, ref] of Object.entries(server.headers)) {
      headers[key] = resolveEnvRef(ref, mcp.envSyntax);
    }
    result.headers = headers;
  }

  return result;
}

/** Transform for agents using named env var style (Codex TOML) */
function transformServerNamed(
  server: NormalizedServer,
  mcp: MCPConfig,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Set transport type
  const transportDef = mcp.transports[server.transport];
  if (transportDef) {
    result[transportDef.typeField] = transportDef.typeValue;
  }

  if (server.transport === "stdio") {
    result.command = server.command;
    if (server.args?.length) {
      result.args = server.args;
    }
  } else if (server.transport === "http") {
    result.url = server.url;
  }

  // For named style, env vars are listed as an array of var names
  if (server.env && Object.keys(server.env).length > 0) {
    result[mcp.envKey] = Object.values(server.env).map((ref) => ref.$env);
  }

  // For headers with bearer tokens, extract to bearer_token_env_var
  if (server.headers) {
    for (const [, ref] of Object.entries(server.headers)) {
      if (ref.prefix?.toLowerCase().startsWith("bearer")) {
        result.bearer_token_env_var = ref.$env;
      }
    }
  }

  return result;
}

/** Resolve an EnvRef to the agent's env var syntax */
function resolveEnvRef(ref: EnvRef, syntax: string): string {
  // Replace VAR placeholder with the actual var name
  const resolved = syntax.replace("VAR", ref.$env);

  // Prepend prefix if present
  if (ref.prefix) {
    return ref.prefix + resolved;
  }

  return resolved;
}
