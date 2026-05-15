import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import path from "node:path";
import os from "node:os";
import * as TOML from "smol-toml";
import { configureCodexLocalPlugins } from "../codex.js";
import type { AgentDefinition } from "../../schemas/agent-schema.js";

let tmpDir: string;
let configDir: string;
let repoDir: string;

function makeCodexDef(): AgentDefinition {
  return {
    id: "codex",
    name: "Codex CLI",
    configDir: { darwin: configDir, linux: configDir, win32: configDir },
    detect: { type: "directory-exists", path: configDir },
    portable: ["AGENTS.md", "skills/**", "plugins/cache/local-plugins/**"],
    ignore: ["sessions/**", "cache/**"],
    credentials: [],
    instructions: {
      filename: "AGENTS.md",
      globalPath: path.join(configDir, "AGENTS.md"),
      globalSupport: true,
    },
    mcp: {
      configPath: "config.toml",
      scope: "user",
      rootKey: "mcp_servers",
      format: "toml",
      writeMode: "merge",
      envSyntax: "env_vars",
      transports: {
        stdio: { typeField: "type", typeValue: "stdio" },
      },
      commandType: "string",
      envKey: "env_vars",
      serverSection: "mcp_servers",
      envVarStyle: "named",
    },
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-test-"));
  configDir = path.join(tmpDir, ".codex");
  repoDir = path.join(tmpDir, "repo");
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(path.join(repoDir, "codex"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("configureCodexLocalPlugins", () => {
  it("materializes symlinked config.toml before writing machine-local paths", () => {
    const repoConfig = path.join(repoDir, "codex", "config.toml");
    fs.writeFileSync(repoConfig, "[features]\nhooks = true\n");
    fs.symlinkSync(repoConfig, path.join(configDir, "config.toml"));

    const pluginRoot = path.join(
      configDir,
      "plugins",
      "cache",
      "local-plugins",
      "caveman",
      "0.1.0",
      ".codex-plugin",
    );
    fs.mkdirSync(pluginRoot, { recursive: true });
    fs.writeFileSync(
      path.join(pluginRoot, "plugin.json"),
      JSON.stringify({
        name: "caveman",
        interface: { category: "Productivity" },
      }),
    );

    const homeDir = path.join(tmpDir, "home");
    const result = configureCodexLocalPlugins(
      makeCodexDef(),
      repoDir,
      false,
      homeDir,
    );

    const localConfig = path.join(configDir, "config.toml");
    expect(result.materializedConfig).toBe(true);
    expect(result.pluginCount).toBe(1);
    expect(fs.lstatSync(localConfig).isSymbolicLink()).toBe(false);

    const parsed = TOML.parse(fs.readFileSync(localConfig, "utf-8")) as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    expect(parsed.plugins["caveman@local-plugins"].enabled).toBe(true);
    expect(parsed.marketplaces["local-plugins"].source).toBe(
      homeDir,
    );
    expect(result.marketplaceUpdated).toBe(true);
    expect(
      fs.lstatSync(path.join(homeDir, "plugins", "caveman")).isSymbolicLink(),
    ).toBe(true);
    expect(fs.readlinkSync(path.join(homeDir, "plugins", "caveman"))).toBe(
      path.join(configDir, "plugins/cache/local-plugins/caveman/0.1.0"),
    );
    const marketplace = JSON.parse(
      fs.readFileSync(
        path.join(homeDir, ".agents", "plugins", "marketplace.json"),
        "utf-8",
      ),
    ) as {
      plugins: Array<{ name: string; source: { path: string } }>;
    };
    expect(marketplace.plugins).toEqual([
      expect.objectContaining({
        name: "caveman",
        source: { source: "local", path: "./plugins/caveman" },
      }),
    ]);

    const repoContent = fs.readFileSync(repoConfig, "utf-8");
    expect(repoContent).not.toContain(homeDir);
  });

  it("copies repo config as a local file when Codex config is missing", () => {
    fs.writeFileSync(
      path.join(repoDir, "codex", "config.toml"),
      "[features]\ngoals = true\n",
    );

    const result = configureCodexLocalPlugins(makeCodexDef(), repoDir);

    expect(result.copiedConfigFromRepo).toBe(true);
    expect(fs.existsSync(path.join(configDir, "config.toml"))).toBe(true);
  });
});
