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
  marketplaceUpdated: boolean;
}

interface LocalPlugin {
  name: string;
  cachePath: string;
  category: string;
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
    marketplaceUpdated: false,
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
  const pluginsFound = findLocalPlugins(localPluginsDir);
  result.pluginCount = pluginsFound.length;
  if (pluginsFound.length === 0 || dryRun) return result;

  const existing = parseTomlFile(configPath);
  const plugins = ensureRecord(existing, "plugins");
  for (const plugin of pluginsFound) {
    plugins[`${plugin.name}@local-plugins`] = { enabled: true };
  }

  ensureHomeLocalPluginMarketplace(homeDir, pluginsFound);
  result.marketplaceUpdated = true;

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

function ensureHomeLocalPluginMarketplace(
  homeDir: string,
  plugins: LocalPlugin[],
): void {
  const pluginsDir = path.join(homeDir, "plugins");
  const marketplacePath = path.join(
    homeDir,
    ".agents",
    "plugins",
    "marketplace.json",
  );

  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.mkdirSync(path.dirname(marketplacePath), { recursive: true });

  for (const plugin of plugins) {
    const sourcePath = path.join(pluginsDir, plugin.name);
    if (!fs.existsSync(sourcePath)) {
      fs.symlinkSync(plugin.cachePath, sourcePath);
    }
  }

  const marketplace = readMarketplace(marketplacePath);
  const entries = Array.isArray(marketplace.plugins)
    ? marketplace.plugins
    : [];
  const existingNames = new Set(
    entries
      .map((entry) =>
        typeof entry === "object" &&
        entry !== null &&
        "name" in entry &&
        typeof entry.name === "string"
          ? entry.name
          : undefined,
      )
      .filter((name): name is string => typeof name === "string"),
  );

  for (const plugin of plugins) {
    if (existingNames.has(plugin.name)) continue;
    entries.push({
      name: plugin.name,
      source: {
        source: "local",
        path: `./plugins/${plugin.name}`,
      },
      policy: {
        installation: "INSTALLED_BY_DEFAULT",
        authentication: "ON_INSTALL",
      },
      category: plugin.category,
    });
  }

  marketplace.plugins = entries;
  fs.writeFileSync(
    marketplacePath,
    JSON.stringify(marketplace, null, 2) + "\n",
    "utf-8",
  );
}

function readMarketplace(filePath: string): Record<string, unknown> {
  if (fs.existsSync(filePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<
        string,
        unknown
      >;
      if (typeof parsed === "object" && parsed !== null) return parsed;
    } catch {
      // Fall through and rebuild a minimal marketplace.
    }
  }

  return {
    name: "local-plugins",
    interface: {
      displayName: "Local Plugins",
    },
    plugins: [],
  };
}

function findLocalPlugins(localPluginsDir: string): LocalPlugin[] {
  if (!fs.existsSync(localPluginsDir)) return [];

  const plugins = new Map<string, LocalPlugin>();
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

      const metadata = readPluginMetadata(pluginJsonPath);
      const pluginName = metadata.name ?? pluginDirName;
      plugins.set(pluginName, {
        name: pluginName,
        cachePath: path.dirname(path.dirname(pluginJsonPath)),
        category: metadata.category ?? "Productivity",
      });
    }
  }

  return [...plugins.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function readPluginMetadata(pluginJsonPath: string): {
  name?: string;
  category?: string;
} {
  try {
    const parsed = JSON.parse(fs.readFileSync(pluginJsonPath, "utf-8")) as {
      name?: unknown;
      interface?: { category?: unknown };
    };
    return {
      name:
        typeof parsed.name === "string" && parsed.name.length > 0
          ? parsed.name
          : undefined,
      category:
        typeof parsed.interface?.category === "string" &&
        parsed.interface.category.length > 0
          ? parsed.interface.category
          : undefined,
    };
  } catch {
    return {};
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
