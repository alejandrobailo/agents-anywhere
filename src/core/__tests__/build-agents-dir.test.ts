import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const distAgentsDir = path.resolve(__dirname, "../../../dist/agents");

/**
 * These tests validate the built dist/agents/ directory.
 * They are skipped when no build output exists (e.g. first clone).
 * Run `npm run build` before running these tests to enable them.
 */
describe.skipIf(!existsSync(distAgentsDir))(
  "dist/agents/ build integrity",
  () => {
    it("contains .json agent definitions directly", () => {
      const entries = readdirSync(distAgentsDir);
      const jsonFiles = entries.filter((e) => e.endsWith(".json"));
      expect(jsonFiles.length).toBeGreaterThan(0);
    });

    it("does not contain a nested agents/ subdirectory (double-nesting bug)", () => {
      const entries = readdirSync(distAgentsDir);
      expect(entries).not.toContain("agents");
    });
  },
);
