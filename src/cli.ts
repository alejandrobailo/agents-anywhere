#!/usr/bin/env node

import { Command } from "commander";

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
  .action(async () => {
    console.log("agentsync init — not yet implemented");
  });

program
  .command("link [agent]")
  .description("Link agent configs from central repo to agent config dirs")
  .action(async (agent?: string) => {
    console.log(`agentsync link ${agent ?? "(all)"} — not yet implemented`);
  });

program
  .command("unlink [agent]")
  .description("Unlink agent configs and restore backups")
  .action(async (agent?: string) => {
    console.log(`agentsync unlink ${agent ?? "(all)"} — not yet implemented`);
  });

program
  .command("status")
  .description("Show link status for all agents and their config files")
  .action(async () => {
    console.log("agentsync status — not yet implemented");
  });

program
  .command("agents")
  .description("List all known agents with install and link status")
  .action(async () => {
    console.log("agentsync agents — not yet implemented");
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
