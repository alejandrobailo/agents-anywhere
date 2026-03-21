/**
 * TypeScript types for declarative agent definition JSON files.
 * Each agent is defined by a JSON file shipped with the package.
 * Adding support for a new agent = adding one JSON file.
 */

/** Platform-specific config directory paths */
export interface PlatformPaths {
  darwin: string;
  linux: string;
  win32: string;
}

/** How to detect if an agent is installed */
export interface DetectRule {
  type: "directory-exists";
  path: string;
}

/** Agent instructions file configuration */
export interface InstructionsConfig {
  filename: string;
  globalPath: string;
  /** Whether the agent supports global (user-level) instructions that can be symlinked */
  globalSupport: boolean;
}

/** Transport definition for MCP */
export interface TransportConfig {
  /** Field name for transport type (e.g. "type"). Omit if agent infers transport implicitly. */
  typeField?: string;
  /** Value for transport type (e.g. "stdio", "local"). Omit if agent infers transport implicitly. */
  typeValue?: string;
  /** Key name for the HTTP URL field (default: "url"). Some agents use "httpUrl". */
  urlKey?: string;
}

/** Map of transport types to their config */
export interface TransportMap {
  stdio?: TransportConfig;
  http?: TransportConfig;
}

/** MCP configuration for an agent */
export interface MCPConfig {
  configPath: string;
  scope: "project-and-user" | "user" | "project";
  rootKey: string;
  format?: "json" | "toml";
  /** How to write the config file: 'standalone' overwrites entire file, 'merge' preserves non-MCP keys */
  writeMode: "standalone" | "merge";
  envSyntax: string;
  defaultSyntax?: string;
  transports: TransportMap;
  commandType: "string" | "array";
  envKey: string;
  /** For TOML-based agents, the section key for server entries */
  serverSection?: string;
  /** For agents that use named env var refs instead of inline syntax */
  envVarStyle?: "inline" | "named";
}

/** Full agent definition */
export interface AgentDefinition {
  id: string;
  name: string;
  configDir: PlatformPaths;
  detect: DetectRule;
  portable: string[];
  ignore: string[];
  credentials: string[];
  instructions: InstructionsConfig;
  mcp: MCPConfig;
}
