/**
 * agentsync mcp add <name> — add an MCP server to mcp.json.
 *
 * Supports two modes:
 * - Non-interactive: when --transport + (--command or --url) are provided, skips prompts
 * - Interactive: prompts for transport, command/URL, args, env vars, headers
 */

import * as fs from "node:fs";
import * as readline from "node:readline/promises";
import path from "node:path";
import { parseMCPConfig } from "../mcp/parser.js";
import type { NormalizedMCPConfig, NormalizedServer, EnvRef } from "../mcp/types.js";
import { loadManifest } from "../utils/manifest.js";
import { success, error, info, warn } from "../utils/output.js";

export interface McpAddFlags {
  transport?: string;
  command?: string;
  url?: string;
  args?: string;
  env?: string[];
}

/**
 * Build a NormalizedServer from CLI flags. Returns null if required flags
 * are missing (caller should fall through to interactive mode).
 */
export function buildServerFromFlags(flags: McpAddFlags): NormalizedServer | null {
  if (!flags.transport) return null;

  if (flags.transport !== "stdio" && flags.transport !== "http") {
    error(`Transport must be "stdio" or "http", got "${flags.transport}"`);
    return null;
  }

  if (flags.transport === "stdio") {
    if (!flags.command) return null;

    const server: NormalizedServer = {
      transport: "stdio",
      command: flags.command,
    };

    if (flags.args) {
      server.args = flags.args.split(",").map((a) => a.trim());
    }

    if (flags.env && flags.env.length > 0) {
      server.env = parseEnvPairs(flags.env);
    }

    return server;
  }

  // http transport
  if (!flags.url) return null;

  const server: NormalizedServer = {
    transport: "http",
    url: flags.url,
  };

  if (flags.env && flags.env.length > 0) {
    server.env = parseEnvPairs(flags.env);
  }

  return server;
}

/** Parse KEY=VAR pairs into an env record */
function parseEnvPairs(pairs: string[]): Record<string, EnvRef> {
  const env: Record<string, EnvRef> = {};
  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) {
      warn(`Skipping invalid env pair "${pair}" — expected KEY=VAR format`);
      continue;
    }
    const key = pair.slice(0, eqIdx);
    const varName = pair.slice(eqIdx + 1);
    if (!key || !varName) {
      warn(`Skipping invalid env pair "${pair}" — empty key or value`);
      continue;
    }
    env[key] = { $env: varName };
  }
  return env;
}

async function ask(
  rl: readline.Interface,
  question: string,
): Promise<string> {
  const answer = await rl.question(question);
  return answer.trim();
}

export async function mcpAddCommand(name: string, flags: McpAddFlags = {}): Promise<void> {
  const manifest = loadManifest();
  if (!manifest) return;

  const mcpPath = path.join(manifest.repoDir, "mcp.json");

  let config: NormalizedMCPConfig;
  try {
    config = parseMCPConfig(mcpPath);
  } catch {
    // If file doesn't exist or is invalid, start fresh
    config = { servers: {} };
  }

  if (config.servers[name]) {
    warn(`Server "${name}" already exists in mcp.json. It will be overwritten.`);
  }

  // Try non-interactive mode when flags are provided
  if (flags.transport) {
    const serverFromFlags = buildServerFromFlags(flags);
    if (serverFromFlags) {
      config.servers[name] = serverFromFlags;
      fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
      success(`Added server "${name}" to mcp.json`);
      info("Run `agentsync mcp sync` to generate per-agent configs.");
    }
    // If transport was provided but buildServerFromFlags returned null,
    // it already printed an error — don't fall through to interactive
    return;
  }

  // Interactive mode (no flags provided)
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    // Transport type
    const transport = await ask(rl, "Transport (stdio/http): ");
    if (transport !== "stdio" && transport !== "http") {
      error('Transport must be "stdio" or "http"');
      return;
    }

    const server: NormalizedServer = { transport };

    if (transport === "stdio") {
      // Command and args
      const command = await ask(rl, "Command (e.g., npx): ");
      if (!command) {
        error("Command is required for stdio transport");
        return;
      }
      server.command = command;

      const argsStr = await ask(rl, "Args (comma-separated, or empty): ");
      if (argsStr) {
        server.args = argsStr.split(",").map((a) => a.trim());
      }
    } else {
      // URL
      const url = await ask(rl, "URL: ");
      if (!url) {
        error("URL is required for http transport");
        return;
      }
      server.url = url;
    }

    // Environment variables
    const envVars: Record<string, EnvRef> = {};
    info("Add environment variables (empty name to finish):");
    while (true) {
      const envName = await ask(rl, "  Env var name (or empty to finish): ");
      if (!envName) break;
      const envVar = await ask(rl, `  Shell variable for ${envName}: `);
      if (!envVar) {
        warn(`Skipping env var "${envName}" — no value provided`);
        continue;
      }
      envVars[envName] = { $env: envVar };
    }
    if (Object.keys(envVars).length > 0) {
      server.env = envVars;
    }

    // Authorization header (for http transport)
    if (transport === "http") {
      const addAuth = await ask(rl, "Add authorization header? (y/n): ");
      if (addAuth.toLowerCase() === "y") {
        const tokenVar = await ask(rl, "  Token env variable name: ");
        if (tokenVar) {
          server.headers = {
            Authorization: { $env: tokenVar, prefix: "Bearer " },
          };
        }
      }
    }

    config.servers[name] = server;

    fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
    success(`Added server "${name}" to mcp.json`);
    info("Run `agentsync mcp sync` to generate per-agent configs.");
  } finally {
    rl.close();
  }
}
