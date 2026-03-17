#!/usr/bin/env node

import { Command } from "commander";

import { initCommand } from "./commands/init.js";
import { linkCommand } from "./commands/link.js";
import { unlinkCommand } from "./commands/unlink.js";
import { statusCommand } from "./commands/status.js";
import { agentsCommand } from "./commands/agents.js";

const program = new Command();

program
  .name("agentsync")
  .description(
    "Manage your AI coding agent configs in one place. One MCP config for every tool.",
  )
  .version("0.1.0");

program
  .command("init")
  .description(
    "Detect installed agents, create config repo, and scaffold structure",
  )
  .argument("[dir]", "Config repo directory (default: ~/agentsync-config)")
  .action(async (dir?: string) => {
    await initCommand(dir);
  });

program
  .command("link [agent]")
  .description("Link agent configs from central repo to agent config dirs")
  .action(async (agent?: string) => {
    await linkCommand(agent);
  });

program
  .command("unlink [agent]")
  .description("Unlink agent configs and restore backups")
  .action(async (agent?: string) => {
    await unlinkCommand(agent);
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

const mcp = program
  .command("mcp")
  .description("MCP server configuration management");

mcp
  .command("sync")
  .description(
    "Generate per-agent MCP configs from the normalized mcp.json",
  )
  .action(async () => {
    console.log("agentsync mcp sync — not yet implemented");
  });

mcp
  .command("add <name>")
  .description("Add an MCP server to the normalized mcp.json")
  .action(async (name: string) => {
    console.log(`agentsync mcp add ${name} — not yet implemented`);
  });

mcp
  .command("list")
  .description("List all configured MCP servers")
  .action(async () => {
    console.log("agentsync mcp list — not yet implemented");
  });

program.parse();
