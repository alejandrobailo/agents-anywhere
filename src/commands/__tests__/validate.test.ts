import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateCommand } from "../validate.js";

describe("validateCommand", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    process.exitCode = undefined;
  });

  it("succeeds against bundled agent definitions", async () => {
    await validateCommand();
    expect(process.exitCode).toBeUndefined();
  });
});
