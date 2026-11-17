#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

const server = new McpServer(
  { name: "nhl-stats", version: "0.1.0" },
  {
    instructions:
      "Live NHL data: scores, standings, schedules, rosters, player stats and league leaders. " +
      "Times are US Eastern. Data comes from the NHL's public web API.",
  },
);

registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
// stdout is the protocol channel, so diagnostics go to stderr.
console.error("nhl-stats MCP server running on stdio");
