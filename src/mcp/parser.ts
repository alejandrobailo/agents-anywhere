/**
 * Parse and validate normalized mcp.json files.
 */

import * as fs from "node:fs";
import type { NormalizedMCPConfig, NormalizedServer } from "./types.js";

/** Parse and validate an mcp.json file */
export function parseMCPConfig(filePath: string): NormalizedMCPConfig {
  const raw = fs.readFileSync(filePath, "utf-8");
  return parseMCPConfigFromString(raw);
}

/** Parse and validate an mcp.json string */
export function parseMCPConfigFromString(content: string): NormalizedMCPConfig {
  const parsed = JSON.parse(content);

  if (!parsed.servers || typeof parsed.servers !== "object") {
    throw new Error('mcp.json must have a "servers" object at the top level');
  }

  for (const [name, server] of Object.entries(parsed.servers)) {
    validateServer(name, server as NormalizedServer);
  }

  return parsed as NormalizedMCPConfig;
}

function validateServer(name: string, server: NormalizedServer): void {
  if (!server.transport) {
    throw new Error(`Server "${name}" must specify a "transport" (stdio or http)`);
  }

  if (server.transport !== "stdio" && server.transport !== "http") {
    throw new Error(`Server "${name}" has invalid transport "${server.transport}" (must be stdio or http)`);
  }

  if (server.transport === "stdio" && !server.command) {
    throw new Error(`Server "${name}" with stdio transport must specify a "command"`);
  }

  if (server.transport === "http" && !server.url) {
    throw new Error(`Server "${name}" with http transport must specify a "url"`);
  }

  // Validate env refs
  if (server.env) {
    for (const [key, ref] of Object.entries(server.env)) {
      if (!ref.$env || typeof ref.$env !== "string") {
        throw new Error(`Server "${name}" env var "${key}" must have a "$env" string`);
      }
    }
  }

  if (server.headers) {
    for (const [key, ref] of Object.entries(server.headers)) {
      if (!ref.$env || typeof ref.$env !== "string") {
        throw new Error(`Server "${name}" header "${key}" must have a "$env" string`);
      }
    }
  }
}
