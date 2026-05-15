import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as TOML from "smol-toml";
import type { AgentDefinition } from "../schemas/agent-schema.js";
import { expandPath, getPlatformPath } from "../utils/paths.js";

export interface CodexLocalPluginConfigResult {
  materializedConfig: boolean;
  copiedConfigFromRepo: boolean;
  pluginCount: number;
}

export function configureCodexLocalPlugins(
  agentDef: AgentDefinition,
  repoDir: string,
  dryRun = false,
  homeDir = os.homedir(),
): CodexLocalPluginConfigResult {
  const result: CodexLocalPluginConfigResult = {
    materializedConfig: false,
    copiedConfigFromRepo: false,
    pluginCount: 0,
  };

  if (agentDef.id !== "codex") return result;

  const configDir = expandPath(getPlatformPath(agentDef.configDir));
  const configPath = path.join(configDir, agentDef.mcp.configPath);
  const repoConfigPath = path.join(repoDir, agentDef.id, agentDef.mcp.configPath);

  let configRaw = "";
  if (fs.existsSync(configPath)) {
    configRaw = fs.readFileSync(configPath, "utf-8");
  } else if (fs.existsSync(repoConfigPath)) {
    configRaw = fs.readFileSync(repoConfigPath, "utf-8");
    result.copiedConfigFromRepo = true;
    if (!dryRun) {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, configRaw, "utf-8");
    }
  }

  if (isSymlink(configPath)) {
    result.materializedConfig = true;
    if (!dryRun) {
      fs.unlinkSync(configPath);
      fs.writeFileSync(configPath, configRaw, "utf-8");
    }
  }

  const localPluginsDir = path.join(
    configDir,
    "plugins",
    "cache",
    "local-plugins",
  );
  const pluginNames = findLocalPluginNames(localPluginsDir);
  result.pluginCount = pluginNames.length;
  if (pluginNames.length === 0 || dryRun) return result;

  const existing = parseTomlFile(configPath);
  const plugins = ensureRecord(existing, "plugins");
  for (const pluginName of pluginNames) {
    plugins[`${pluginName}@local-plugins`] = { enabled: true };
  }

  const marketplaces = ensureRecord(existing, "marketplaces");
  const localMarketplace = ensureRecord(marketplaces, "local-plugins");
  localMarketplace.source_type = "local";
  localMarketplace.source = homeDir;
  if (typeof localMarketplace.last_updated !== "string") {
    localMarketplace.last_updated = new Date().toISOString();
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, TOML.stringify(existing) + "\n", "utf-8");
  return result;
}

function parseTomlFile(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, "utf-8");
  if (raw.trim() === "") return {};
  return TOML.parse(raw) as Record<string, unknown>;
}

function ensureRecord(
  parent: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  if (
    typeof parent[key] !== "object" ||
    parent[key] === null ||
    Array.isArray(parent[key])
  ) {
    parent[key] = {};
  }
  return parent[key] as Record<string, unknown>;
}

function findLocalPluginNames(localPluginsDir: string): string[] {
  if (!fs.existsSync(localPluginsDir)) return [];

  const names = new Set<string>();
  for (const pluginDirName of fs.readdirSync(localPluginsDir)) {
    const pluginDir = path.join(localPluginsDir, pluginDirName);
    if (!isDirectory(pluginDir)) continue;

    for (const versionDirName of fs.readdirSync(pluginDir)) {
      const pluginJsonPath = path.join(
        pluginDir,
        versionDirName,
        ".codex-plugin",
        "plugin.json",
      );
      if (!fs.existsSync(pluginJsonPath)) continue;

      const pluginName = readPluginName(pluginJsonPath) ?? pluginDirName;
      names.add(pluginName);
    }
  }

  return [...names].sort();
}

function readPluginName(pluginJsonPath: string): string | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(pluginJsonPath, "utf-8")) as {
      name?: unknown;
    };
    return typeof parsed.name === "string" && parsed.name.length > 0
      ? parsed.name
      : undefined;
  } catch {
    return undefined;
  }
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isSymlink(p: string): boolean {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}
