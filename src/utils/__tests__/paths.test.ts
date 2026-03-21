import { describe, it, expect, vi, afterEach } from "vitest";
import { getPlatformPath } from "../paths.js";

const samplePaths = {
  darwin: "~/.my-agent",
  linux: "~/.config/my-agent",
  win32: "%APPDATA%/my-agent",
};

describe("getPlatformPath", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns darwin path on macOS", () => {
    vi.stubGlobal("process", { ...process, platform: "darwin" });
    expect(getPlatformPath(samplePaths)).toBe("~/.my-agent");
  });

  it("returns linux path on Linux", () => {
    vi.stubGlobal("process", { ...process, platform: "linux" });
    expect(getPlatformPath(samplePaths)).toBe("~/.config/my-agent");
  });

  it("returns win32 path on Windows", () => {
    vi.stubGlobal("process", { ...process, platform: "win32" });
    expect(getPlatformPath(samplePaths)).toBe("%APPDATA%/my-agent");
  });

  it("warns and falls back to linux on unknown platform", () => {
    const warnSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("process", { ...process, platform: "freebsd" });
    const result = getPlatformPath(samplePaths);
    expect(result).toBe("~/.config/my-agent");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unsupported platform"),
    );
  });
});
