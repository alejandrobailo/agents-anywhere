/**
 * agents-anywhere mcp list — read mcp.json and show table of servers
 * with transport type, command/URL, and env vars.
 */

import path from "node:path";
import { parseMCPConfig } from "../mcp/parser.js";
import { loadManifest } from "../utils/manifest.js";
import { heading, warn, error, dim, bold, table } from "../utils/output.js";

export async function mcpListCommand(): Promise<void> {
  const manifest = loadManifest();
  if (!manifest) return;

  const mcpPath = path.join(manifest.repoDir, "mcp.json");

  let config;
  try {
    config = parseMCPConfig(mcpPath);
  } catch (err) {
    error(`Failed to parse mcp.json: ${(err as Error).message}`);
    return;
  }

  const servers = Object.entries(config.servers);
  if (servers.length === 0) {
    warn("No MCP servers configured. Use `agents-anywhere mcp add` to add one.");
    return;
  }

  heading(`MCP Servers (${servers.length})`);

  const rows: Array<[string, string]> = [];
  for (const [name, server] of servers) {
    const target =
      server.transport === "stdio"
        ? `${server.command}${server.args?.length ? " " + server.args.join(" ") : ""}`
        : server.url ?? "";

    const envVars = server.env
      ? Object.values(server.env)
          .map((ref) => ref.$env)
          .join(", ")
      : "";

    const headerVars = server.headers
      ? Object.values(server.headers)
          .map((ref) => ref.$env)
          .join(", ")
      : "";

    rows.push([bold(name), `${server.transport}  ${dim(target)}`]);
    if (envVars) {
      rows.push(["", `env: ${envVars}`]);
    }
    if (headerVars) {
      rows.push(["", `headers: ${headerVars}`]);
    }
  }

  table(rows);
}
