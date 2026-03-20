import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PortableStatus } from "../../core/linker.js";
import type { Manifest } from "../../utils/manifest.js";

vi.mock("../../utils/manifest.js");
vi.mock("../../core/schema-loader.js");
vi.mock("../../core/linker.js");

import { statusCommand } from "../status.js";
import { loadManifest } from "../../utils/manifest.js";
import { loadAgentById } from "../../core/schema-loader.js";
import { getStatus } from "../../core/linker.js";

const mockLoadManifest = vi.mocked(loadManifest);
const mockLoadAgentById = vi.mocked(loadAgentById);
const mockGetStatus = vi.mocked(getStatus);

let logs: string[];
let errorLogs: string[];

beforeEach(() => {
  logs = [];
  errorLogs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errorLogs.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("statusCommand", () => {
  it("exits early when no manifest is found", async () => {
    mockLoadManifest.mockReturnValue(null);

    await statusCommand();

    // loadAgentById should never be called
    expect(mockLoadAgentById).not.toHaveBeenCalled();
  });

  it("warns when manifest has no agents", async () => {
    mockLoadManifest.mockReturnValue({
      version: "0.4.0",
      repoDir: "/tmp/repo",
      agents: {},
    } as Manifest);

    await statusCommand();

    const output = logs.join("\n");
    expect(output).toContain("No agents");
  });

  it("shows link status for each agent", async () => {
    mockLoadManifest.mockReturnValue({
      version: "0.4.0",
      repoDir: "/tmp/repo",
      agents: {
        "claude-code": { enabled: true, name: "Claude Code" },
        "codex": { enabled: true, name: "Codex CLI" },
      },
    } as Manifest);

    mockLoadAgentById.mockImplementation((id: string) => {
      if (id === "claude-code") {
        return {
          id: "claude-code",
          name: "Claude Code",
          configDir: { darwin: "~/.claude", linux: "~/.claude", win32: "%APPDATA%/claude" },
          detect: { type: "directory-exists" as const, path: "~/.claude" },
          portable: ["settings.json", "CLAUDE.md"],
          ignore: [],
          credentials: [],
          instructions: { filename: "CLAUDE.md", globalPath: "~/.claude/CLAUDE.md" },
          mcp: {
            configPath: ".mcp.json",
            scope: "project-and-user" as const,
            rootKey: "mcpServers",
            writeMode: "standalone" as const,
            envSyntax: "${VAR}",
            transports: { stdio: { typeField: "type", typeValue: "stdio" } },
            commandType: "string" as const,
            envKey: "env",
          },
        };
      }
      if (id === "codex") {
        return {
          id: "codex",
          name: "Codex CLI",
          configDir: { darwin: "~/.codex", linux: "~/.codex", win32: "%APPDATA%/codex" },
          detect: { type: "directory-exists" as const, path: "~/.codex" },
          portable: ["config.toml"],
          ignore: [],
          credentials: [],
          instructions: { filename: "AGENTS.md", globalPath: "~/.codex/AGENTS.md" },
          mcp: {
            configPath: "config.toml",
            scope: "user" as const,
            rootKey: "mcp_servers",
            format: "toml" as const,
            writeMode: "merge" as const,
            envSyntax: "${VAR}",
            transports: {},
            commandType: "array" as const,
            envKey: "env_vars",
            envVarStyle: "named" as const,
          },
        };
      }
      return null;
    });

    mockGetStatus.mockImplementation((agentDef) => {
      if (agentDef.id === "claude-code") {
        return [
          { item: "settings.json", status: "linked", agentPath: "", repoPath: "" },
          { item: "CLAUDE.md", status: "unlinked", agentPath: "", repoPath: "" },
        ] as PortableStatus[];
      }
      return [
        { item: "config.toml", status: "linked", agentPath: "", repoPath: "" },
      ] as PortableStatus[];
    });

    await statusCommand();

    const output = logs.join("\n");
    expect(output).toContain("Agent link status");
    expect(output).toContain("Claude Code");
    expect(output).toContain("Codex CLI");
    expect(output).toContain("settings.json");
    expect(output).toContain("CLAUDE.md");
    expect(output).toContain("config.toml");
  });

  it("warns when an agent definition is not found", async () => {
    mockLoadManifest.mockReturnValue({
      version: "0.4.0",
      repoDir: "/tmp/repo",
      agents: {
        "unknown-agent": { enabled: true, name: "Unknown" },
      },
    } as Manifest);

    mockLoadAgentById.mockReturnValue(null);

    await statusCommand();

    const output = logs.join("\n");
    expect(output).toContain("unknown-agent");
    expect(output).toContain("definition not found");
  });
});
