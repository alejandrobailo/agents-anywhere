import { describe, it, expect } from "vitest";
import { getAgentsDir } from "../schema-loader.js";
import { readdirSync } from "node:fs";

describe("getAgentsDir (build integrity)", () => {
  it("returns a directory containing .json files directly", () => {
    const dir = getAgentsDir();
    const entries = readdirSync(dir);
    const jsonFiles = entries.filter((e) => e.endsWith(".json"));
    expect(jsonFiles.length).toBeGreaterThan(0);
  });

  it("does not contain a nested agents/ subdirectory", () => {
    const dir = getAgentsDir();
    const entries = readdirSync(dir);
    // If "agents" appears as an entry, the build produced double-nesting
    expect(entries).not.toContain("agents");
  });
});
