/**
 * agentsync mcp add <name> — interactive prompts to add an MCP server to mcp.json.
 *
 * Prompts for: transport, command/URL, args, env vars, headers.
 * Appends the server entry to the normalized mcp.json file.
 */

import * as fs from "node:fs";
import * as readline from "node:readline/promises";
import path from "node:path";
import { parseMCPConfig } from "../mcp/parser.js";
import type { NormalizedMCPConfig, NormalizedServer, EnvRef } from "../mcp/types.js";
import { loadManifest } from "../utils/manifest.js";
import { success, error, info, warn } from "../utils/output.js";

async function ask(
  rl: readline.Interface,
  question: string,
): Promise<string> {
  const answer = await rl.question(question);
  return answer.trim();
}

export async function mcpAddCommand(name: string): Promise<void> {
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
      if (!envVar) break;
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
