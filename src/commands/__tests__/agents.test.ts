import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DetectedAgent } from "../../core/detector.js";
import type { AgentDefinition } from "../../schemas/agent-schema.js";
import type { Manifest } from "../../utils/manifest.js";

vi.mock("../../core/detector.js");
vi.mock("../../utils/manifest.js");
vi.mock("../../core/linker.js");

import { agentsCommand } from "../agents.js";
import { detectAgents } from "../../core/detector.js";
import { loadManifest } from "../../utils/manifest.js";
import { getStatus } from "../../core/linker.js";

const mockDetectAgents = vi.mocked(detectAgents);
const mockLoadManifest = vi.mocked(loadManifest);
const mockGetStatus = vi.mocked(getStatus);

function makeAgentDef(overrides: Partial<AgentDefinition>): AgentDefinition {
  return {
    id: "test-agent",
    name: "Test Agent",
    configDir: { darwin: "~/.test", linux: "~/.test", win32: "%APPDATA%/test" },
    detect: { type: "directory-exists" as const, path: "~/.test" },
    portable: ["config.json"],
    ignore: [],
    credentials: [],
    instructions: { filename: "AGENTS.md", globalPath: "~/.test/AGENTS.md" },
    mcp: {
      configPath: "mcp.json",
      scope: "user" as const,
      rootKey: "mcpServers",
      writeMode: "standalone" as const,
      envSyntax: "${VAR}",
      transports: {},
      commandType: "string" as const,
      envKey: "env",
    },
    ...overrides,
  };
}

let logs: string[];

beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("agentsCommand", () => {
  it("shows installed and not-installed agents", async () => {
    mockLoadManifest.mockReturnValue(null);

    const agents: DetectedAgent[] = [
      {
        definition: makeAgentDef({ id: "claude-code", name: "Claude Code" }),
        configDir: "~/.claude",
        installed: true,
      },
      {
        definition: makeAgentDef({ id: "codex", name: "Codex CLI" }),
        configDir: "~/.codex",
        installed: false,
      },
    ];

    mockDetectAgents.mockReturnValue(agents);

    await agentsCommand();

    const output = logs.join("\n");
    expect(output).toContain("Known AI coding agents");
    expect(output).toContain("Claude Code");
    expect(output).toContain("Codex CLI");
    expect(output).toContain("installed");
    expect(output).toContain("not installed");
  });

  it("shows linked badge when all items are linked", async () => {
    const claudeDef = makeAgentDef({ id: "claude-code", name: "Claude Code" });

    mockLoadManifest.mockReturnValue({
      version: "0.4.0",
      repoDir: "/tmp/repo",
      agents: {
        "claude-code": { enabled: true, name: "Claude Code" },
      },
    } as Manifest);

    mockDetectAgents.mockReturnValue([
      {
        definition: claudeDef,
        configDir: "~/.claude",
        installed: true,
      },
    ]);

    mockGetStatus.mockReturnValue([
      { item: "config.json", status: "linked", agentPath: "", repoPath: "" },
    ]);

    await agentsCommand();

    const output = logs.join("\n");
    expect(output).toContain("Claude Code");
    expect(output).toContain("installed");
    expect(output).toContain("linked");
  });

  it("shows partial link count when some items are linked", async () => {
    const claudeDef = makeAgentDef({ id: "claude-code", name: "Claude Code" });

    mockLoadManifest.mockReturnValue({
      version: "0.4.0",
      repoDir: "/tmp/repo",
      agents: {
        "claude-code": { enabled: true, name: "Claude Code" },
      },
    } as Manifest);

    mockDetectAgents.mockReturnValue([
      {
        definition: claudeDef,
        configDir: "~/.claude",
        installed: true,
      },
    ]);

    mockGetStatus.mockReturnValue([
      { item: "config.json", status: "linked", agentPath: "", repoPath: "" },
      { item: "AGENTS.md", status: "unlinked", agentPath: "", repoPath: "" },
    ]);

    await agentsCommand();

    const output = logs.join("\n");
    expect(output).toContain("1/2 linked");
  });
});
