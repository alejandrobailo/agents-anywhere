import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { green, red, dim, bold, yellow, cyan, useColor, debug, setVerbose, isVerbose } from "../output.js";

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

describe("output — verbose / debug", () => {
  afterEach(() => {
    setVerbose(false);
    delete process.env.AGENTS_ANYWHERE_VERBOSE;
    vi.restoreAllMocks();
  });

  it("isVerbose() returns false by default", () => {
    expect(isVerbose()).toBe(false);
  });

  it("debug() is silent when verbose is not set", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    debug("test message");
    expect(spy).not.toHaveBeenCalled();
  });

  it("debug() prints to stderr when setVerbose(true)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    setVerbose(true);
    debug("test message");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("test message");
  });

  it("debug() prints when AGENTS_ANYWHERE_VERBOSE env var is set", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.AGENTS_ANYWHERE_VERBOSE = "1";
    debug("env test");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("env test");
  });

  it("isVerbose() returns true after setVerbose(true)", () => {
    setVerbose(true);
    expect(isVerbose()).toBe(true);
  });
});
