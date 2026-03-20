import { describe, expect, it } from "vitest";
import { buildServerFromFlags } from "../mcp-add.js";

describe("buildServerFromFlags", () => {
  it("builds a stdio server with command, args, and env", () => {
    const result = buildServerFromFlags({
      transport: "stdio",
      command: "npx",
      args: "-y,@mcp/server-github",
      env: ["GITHUB_TOKEN=GITHUB_TOKEN"],
    });

    expect(result).toEqual({
      transport: "stdio",
      command: "npx",
      args: ["-y", "@mcp/server-github"],
      env: {
        GITHUB_TOKEN: { $env: "GITHUB_TOKEN" },
      },
    });
  });

  it("builds an http server with url", () => {
    const result = buildServerFromFlags({
      transport: "http",
      url: "https://example.com",
    });

    expect(result).toEqual({
      transport: "http",
      url: "https://example.com",
    });
  });

  it("returns null when stdio transport is missing --command", () => {
    const result = buildServerFromFlags({
      transport: "stdio",
    });

    expect(result).toBeNull();
  });

  it("returns null when http transport is missing --url", () => {
    const result = buildServerFromFlags({
      transport: "http",
    });

    expect(result).toBeNull();
  });

  it("parses multiple --env flags correctly", () => {
    const result = buildServerFromFlags({
      transport: "stdio",
      command: "node",
      env: ["GITHUB_TOKEN=GITHUB_TOKEN", "SENTRY_DSN=MY_SENTRY_DSN", "API_KEY=SECRET_KEY"],
    });

    expect(result).not.toBeNull();
    expect(result!.env).toEqual({
      GITHUB_TOKEN: { $env: "GITHUB_TOKEN" },
      SENTRY_DSN: { $env: "MY_SENTRY_DSN" },
      API_KEY: { $env: "SECRET_KEY" },
    });
  });

  it("returns null when no transport is provided", () => {
    const result = buildServerFromFlags({});
    expect(result).toBeNull();
  });

  it("returns null for invalid transport type", () => {
    const result = buildServerFromFlags({
      transport: "websocket",
      command: "node",
    });

    expect(result).toBeNull();
  });

  it("builds a stdio server without optional args and env", () => {
    const result = buildServerFromFlags({
      transport: "stdio",
      command: "node",
    });

    expect(result).toEqual({
      transport: "stdio",
      command: "node",
    });
  });
});
