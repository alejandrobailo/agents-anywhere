/**
 * Colored console output helpers for CLI commands.
 * Uses ANSI escape codes directly — no dependencies.
 * Respects NO_COLOR (https://no-color.org/) and FORCE_COLOR env vars.
 */

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const CYAN = "\x1b[36m";

/** Check if color output should be used */
export function useColor(): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR !== undefined) return true;
  return process.stdout.isTTY === true;
}

function wrap(code: string, msg: string): string {
  return useColor() ? `${code}${msg}${RESET}` : msg;
}

export function info(msg: string): void {
  const prefix = useColor() ? `${BLUE}ℹ${RESET}` : "ℹ";
  console.log(`${prefix} ${msg}`);
}

export function success(msg: string): void {
  const prefix = useColor() ? `${GREEN}✓${RESET}` : "✓";
  console.log(`${prefix} ${msg}`);
}

export function warn(msg: string): void {
  const prefix = useColor() ? `${YELLOW}⚠${RESET}` : "⚠";
  console.log(`${prefix} ${msg}`);
}

export function error(msg: string): void {
  const prefix = useColor() ? `${RED}✗${RESET}` : "✗";
  console.error(`${prefix} ${msg}`);
}

export function heading(msg: string): void {
  console.log(`\n${wrap(BOLD, msg)}`);
}

export function dim(msg: string): string {
  return wrap(DIM, msg);
}

export function bold(msg: string): string {
  return wrap(BOLD, msg);
}

export function green(msg: string): string {
  return wrap(GREEN, msg);
}

export function yellow(msg: string): string {
  return wrap(YELLOW, msg);
}

export function red(msg: string): string {
  return wrap(RED, msg);
}

export function cyan(msg: string): string {
  return wrap(CYAN, msg);
}

/** Print a simple key-value table */
export function table(rows: Array<[string, string]>, indent = 2): void {
  if (rows.length === 0) return;
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
