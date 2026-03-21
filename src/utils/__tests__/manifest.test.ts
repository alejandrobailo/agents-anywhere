import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadManifest, saveManifest } from "../manifest.js";

describe("manifest — validation", () => {
  let tmpDir: string;
  const originalCwd = process.cwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-manifest-test-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeManifest(data: unknown): void {
    fs.writeFileSync(
      path.join(tmpDir, "agents-anywhere.json"),
      JSON.stringify(data),
      "utf-8",
    );
  }

  it("loads a valid manifest", () => {
    writeManifest({
      version: "0.1.0",
      repoDir: tmpDir,
      agents: {
        "claude-code": { enabled: true, name: "Claude Code" },
      },
    });
    const result = loadManifest();
    expect(result).not.toBeNull();
    expect(result!.version).toBe("0.1.0");
    expect(result!.agents["claude-code"].enabled).toBe(true);
  });

  it("rejects missing version", () => {
    writeManifest({ agents: {} });
    expect(loadManifest()).toBeNull();
  });

  it("rejects numeric version", () => {
    writeManifest({ version: 1, agents: {} });
    expect(loadManifest()).toBeNull();
  });

  it("rejects missing agents", () => {
    writeManifest({ version: "0.1.0" });
    expect(loadManifest()).toBeNull();
  });

  it("rejects agents as array", () => {
    writeManifest({ version: "0.1.0", agents: [] });
    expect(loadManifest()).toBeNull();
  });

  it("rejects agent without enabled field", () => {
    writeManifest({
      version: "0.1.0",
      agents: { foo: { name: "Foo" } },
    });
    expect(loadManifest()).toBeNull();
  });

  it("rejects agent with string enabled", () => {
    writeManifest({
      version: "0.1.0",
      agents: { foo: { enabled: "yes", name: "Foo" } },
    });
    expect(loadManifest()).toBeNull();
  });

  it("rejects agent without name", () => {
    writeManifest({
      version: "0.1.0",
      agents: { foo: { enabled: true } },
    });
    expect(loadManifest()).toBeNull();
  });

  it("rejects non-JSON content", () => {
    fs.writeFileSync(
      path.join(tmpDir, "agents-anywhere.json"),
      "not json",
      "utf-8",
    );
    expect(loadManifest()).toBeNull();
  });
});

describe("manifest — saveManifest", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-manifest-save-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes manifest to disk", () => {
    const manifest = {
      version: "0.1.0",
      repoDir: tmpDir,
      agents: {
        "claude-code": { enabled: true, name: "Claude Code" },
      },
    };
    saveManifest(manifest);
    const raw = fs.readFileSync(
      path.join(tmpDir, "agents-anywhere.json"),
      "utf-8",
    );
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe("0.1.0");
    expect(parsed.agents["claude-code"].enabled).toBe(true);
  });
});
