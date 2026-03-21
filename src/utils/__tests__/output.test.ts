import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { green, red, dim, bold, yellow, cyan, useColor } from "../output.js";

describe("output — color support", () => {
  const originalEnv = { ...process.env };
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    originalIsTTY = process.stdout.isTTY;
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;
    // Make isTTY configurable for testing
    Object.defineProperty(process.stdout, "isTTY", {
      value: originalIsTTY,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    Object.defineProperty(process.stdout, "isTTY", {
      value: originalIsTTY,
      writable: true,
      configurable: true,
    });
  });

  it("disables color when NO_COLOR is set", () => {
    process.env.NO_COLOR = "";
    expect(useColor()).toBe(false);
    expect(green("hello")).toBe("hello");
    expect(red("hello")).toBe("hello");
    expect(dim("hello")).toBe("hello");
    expect(bold("hello")).toBe("hello");
  });

  it("enables color when FORCE_COLOR is set even without TTY", () => {
    process.env.FORCE_COLOR = "1";
    Object.defineProperty(process.stdout, "isTTY", {
      value: false,
      writable: true,
      configurable: true,
    });
    expect(useColor()).toBe(true);
    expect(green("hello")).toContain("\x1b[");
  });

  it("disables color when not a TTY", () => {
    Object.defineProperty(process.stdout, "isTTY", {
      value: false,
      writable: true,
      configurable: true,
    });
    expect(useColor()).toBe(false);
    expect(yellow("hello")).toBe("hello");
    expect(cyan("hello")).toBe("hello");
  });

  it("enables color when TTY", () => {
    Object.defineProperty(process.stdout, "isTTY", {
      value: true,
      writable: true,
      configurable: true,
    });
    expect(useColor()).toBe(true);
    expect(green("hello")).toContain("\x1b[32m");
  });

  it("NO_COLOR takes precedence over FORCE_COLOR", () => {
    process.env.NO_COLOR = "";
    process.env.FORCE_COLOR = "1";
    expect(useColor()).toBe(false);
  });
});
