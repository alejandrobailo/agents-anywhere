import { describe, expect, it } from "vitest";
import { diffServers, type ServerDiff } from "../mcp-diff.js";

describe("diffServers", () => {
  it("treats all servers as added when existing is null (no file)", () => {
    const incoming = {
      github: { type: "stdio", command: "npx" },
      sentry: { type: "http", url: "https://mcp.sentry.dev/sse" },
    };

    const diff = diffServers(null, incoming);

    expect(diff.added).toEqual(["github", "sentry"]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
    expect(diff.unchanged).toEqual([]);
  });

  it("reports no changes when configs are identical", () => {
    const servers = {
      github: { type: "stdio", command: "npx", args: ["-y", "@mcp/server-github"] },
      sentry: { type: "http", url: "https://mcp.sentry.dev/sse" },
    };

    const diff = diffServers(servers, servers);

    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
    expect(diff.unchanged).toEqual(["github", "sentry"]);
  });

  it("detects added servers", () => {
    const existing = {
      github: { type: "stdio", command: "npx" },
    };
    const incoming = {
      github: { type: "stdio", command: "npx" },
      sentry: { type: "http", url: "https://mcp.sentry.dev/sse" },
    };

    const diff = diffServers(existing, incoming);

    expect(diff.added).toEqual(["sentry"]);
    expect(diff.unchanged).toEqual(["github"]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it("detects removed servers", () => {
    const existing = {
      github: { type: "stdio", command: "npx" },
      sentry: { type: "http", url: "https://mcp.sentry.dev/sse" },
    };
    const incoming = {
      github: { type: "stdio", command: "npx" },
    };

    const diff = diffServers(existing, incoming);

    expect(diff.removed).toEqual(["sentry"]);
    expect(diff.unchanged).toEqual(["github"]);
    expect(diff.added).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it("detects changed servers", () => {
    const existing = {
      github: { type: "stdio", command: "npx", args: ["-y", "old-package"] },
    };
    const incoming = {
      github: { type: "stdio", command: "npx", args: ["-y", "new-package"] },
    };

    const diff = diffServers(existing, incoming);

    expect(diff.changed).toEqual(["github"]);
    expect(diff.unchanged).toEqual([]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it("handles mixed add/remove/change/unchanged", () => {
    const existing = {
      github: { type: "stdio", command: "npx" },
      sentry: { type: "http", url: "https://old.sentry.dev/sse" },
      deprecated: { type: "stdio", command: "old-tool" },
    };
    const incoming = {
      github: { type: "stdio", command: "npx" },
      sentry: { type: "http", url: "https://new.sentry.dev/sse" },
      linear: { type: "http", url: "https://mcp.linear.app" },
    };

    const diff = diffServers(existing, incoming);

    expect(diff.unchanged).toEqual(["github"]);
    expect(diff.changed).toEqual(["sentry"]);
    expect(diff.added).toEqual(["linear"]);
    expect(diff.removed).toEqual(["deprecated"]);
  });

  it("handles empty existing and empty incoming", () => {
    const diff = diffServers({}, {});

    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
    expect(diff.unchanged).toEqual([]);
  });

  it("handles null existing with empty incoming", () => {
    const diff = diffServers(null, {});

    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
    expect(diff.unchanged).toEqual([]);
  });
});
