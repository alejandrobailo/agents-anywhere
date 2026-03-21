/**
 * Types for the normalized MCP configuration format.
 * This is the canonical format users write in mcp.json.
 * agents-anywhere transforms this into per-agent formats.
 */

/** Reference to an environment variable — never stored as a literal value */
export interface EnvRef {
  $env: string;
  /** Optional prefix prepended to the env value (e.g., "Bearer ") */
  prefix?: string;
}

/** A normalized MCP server definition */
export interface NormalizedServer {
  transport: "stdio" | "http";
  /** Command to run (stdio transport) */
  command?: string;
  /** Arguments for the command (stdio transport) */
  args?: string[];
  /** URL for HTTP transport */
  url?: string;
  /** Environment variables for the server process */
  env?: Record<string, EnvRef>;
  /** HTTP headers (http transport) */
  headers?: Record<string, EnvRef>;
}

/** The normalized MCP config file (mcp.json) */
export interface NormalizedMCPConfig {
  servers: Record<string, NormalizedServer>;
}
