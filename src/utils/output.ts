/**
 * Colored console output helpers for CLI commands.
 * Uses ANSI escape codes directly — no dependencies.
 */

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const CYAN = "\x1b[36m";

export function info(msg: string): void {
  console.log(`${BLUE}ℹ${RESET} ${msg}`);
}

export function success(msg: string): void {
  console.log(`${GREEN}✓${RESET} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`${YELLOW}⚠${RESET} ${msg}`);
}

export function error(msg: string): void {
  console.error(`${RED}✗${RESET} ${msg}`);
}

export function heading(msg: string): void {
  console.log(`\n${BOLD}${msg}${RESET}`);
}

export function dim(msg: string): string {
  return `${DIM}${msg}${RESET}`;
}

export function bold(msg: string): string {
  return `${BOLD}${msg}${RESET}`;
}

export function green(msg: string): string {
  return `${GREEN}${msg}${RESET}`;
}

export function yellow(msg: string): string {
  return `${YELLOW}${msg}${RESET}`;
}

export function red(msg: string): string {
  return `${RED}${msg}${RESET}`;
}

export function cyan(msg: string): string {
  return `${CYAN}${msg}${RESET}`;
}

/** Print a simple key-value table */
export function table(rows: Array<[string, string]>, indent = 2): void {
  const maxKey = Math.max(...rows.map(([k]) => k.length));
  const pad = " ".repeat(indent);
  for (const [key, value] of rows) {
    console.log(`${pad}${key.padEnd(maxKey)}  ${value}`);
  }
}

/** Print a status badge based on link status */
export function statusBadge(status: string): string {
  switch (status) {
    case "linked":
      return green("linked");
    case "unlinked":
      return dim("unlinked");
    case "diverged":
      return yellow("diverged");
    case "missing":
      return dim("missing");
    case "installed":
      return green("installed");
    case "not installed":
      return dim("not installed");
    default:
      return status;
  }
}
