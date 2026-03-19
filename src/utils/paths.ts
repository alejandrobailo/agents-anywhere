import path from "node:path";
import os from "node:os";

/**
 * Expand ~ to the user's home directory and resolve the path.
 * Also handles %APPDATA% on Windows.
 */
export function expandPath(p: string): string {
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1));
  }
  if (p.startsWith("%APPDATA%")) {
    if (process.env.APPDATA) {
      return path.join(process.env.APPDATA, p.slice("%APPDATA%".length));
    }
    if (process.platform === "win32") {
      throw new Error("APPDATA environment variable is not set");
    }
  }
  return p;
}

/**
 * Get the platform-specific path from a PlatformPaths object.
 */
export function getPlatformPath(paths: {
  darwin: string;
  linux: string;
  win32: string;
}): string {
  const platform = process.platform as "darwin" | "linux" | "win32";
  return paths[platform] ?? paths.linux;
}
