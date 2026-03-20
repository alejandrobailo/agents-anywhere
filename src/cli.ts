import { Command } from "commander";

import { version } from "./version.js";
import { initCommand } from "./commands/init.js";
import { linkCommand } from "./commands/link.js";
import { unlinkCommand } from "./commands/unlink.js";
import { statusCommand } from "./commands/status.js";
import { agentsCommand } from "./commands/agents.js";
import { mcpSyncCommand } from "./commands/mcp-sync.js";
import { mcpAddCommand } from "./commands/mcp-add.js";
import { mcpListCommand } from "./commands/mcp-list.js";
import { mcpDiffCommand } from "./commands/mcp-diff.js";
import { doctorCommand } from "./commands/doctor.js";
import { validateCommand } from "./commands/validate.js";
import { exportCommand } from "./commands/export.js";

const program = new Command();

program
  .name("agentsync")
  .description(
    "Manage your AI coding agent configs in one place. One MCP config for every tool.",
  )
  .version(version);

program
  .command("init")
  .description(
    "Detect installed agents, create config repo, and scaffold structure",
  )
  .argument("[dir]", "Config repo directory (default: ~/agentsync-config)")
  .option("--from <url>", "Clone an existing agentsync config repo from a git URL")
  .action(async (dir?: string, opts?: { from?: string }) => {
    await initCommand(dir, { from: opts?.from });
  });

program
  .command("link [agent]")
  .description("Link agent configs from central repo to agent config dirs")
  .option("--dry-run", "Show what would be linked without making changes")
  .action(async (agent: string | undefined, opts: { dryRun?: boolean }) => {
    await linkCommand(agent, { dryRun: opts.dryRun });
  });

program
  .command("unlink [agent]")
  .description("Unlink agent configs and restore backups")
  .option("--dry-run", "Show what would be unlinked without making changes")
  .action(async (agent: string | undefined, opts: { dryRun?: boolean }) => {
    await unlinkCommand(agent, { dryRun: opts.dryRun });
  });

program
  .command("status")
  .description("Show link status for all agents and their config files")
  .action(async () => {
    await statusCommand();
  });

program
  .command("agents")
  .description("List all known agents with install and link status")
  .action(async () => {
    await agentsCommand();
  });

program
  .command("doctor")
  .description("Diagnose config health: broken symlinks, credentials, stale configs")
  .action(async () => {
    await doctorCommand();
  });

program
  .command("validate")
  .description("Validate all bundled agent definition JSON files against the schema")
  .action(async () => {
    await validateCommand();
  });

program
  .command("export")
  .description(
    "Generate a standalone install script (pure bash, no agentsync needed)",
  )
  .action(async () => {
    await exportCommand();
  });

const mcp = program
  .command("mcp")
  .description("MCP server configuration management");

mcp
  .command("sync")
  .description(
    "Generate per-agent MCP configs from the normalized mcp.json",
  )
  .option("--dry-run", "Show what would be written without making changes")
  .action(async (opts: { dryRun?: boolean }) => {
    await mcpSyncCommand({ dryRun: opts.dryRun });
  });

mcp
  .command("add <name>")
  .description("Add an MCP server to the normalized mcp.json")
  .option("--transport <type>", "Transport type: stdio or http")
  .option("--command <cmd>", "Command to run (stdio transport)")
  .option("--url <url>", "Server URL (http transport)")
  .option("--args <csv>", "Comma-separated arguments (stdio transport)")
  .option("--env <pair...>", "Environment variables as KEY=VAR pairs")
  .action(async (name: string, opts: { transport?: string; command?: string; url?: string; args?: string; env?: string[] }) => {
    await mcpAddCommand(name, opts);
  });

mcp
  .command("diff")
  .description("Preview what `mcp sync` would change for each agent")
  .action(async () => {
    await mcpDiffCommand();
  });

mcp
  .command("list")
  .description("List all configured MCP servers")
  .action(async () => {
    await mcpListCommand();
  });

program.parseAsync().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
