// End-to-end smoke test: launches the built server over stdio with the official MCP client
// and calls every tool against the live NHL API.  Run with: npm run smoke
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "smoke-test", version: "0.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ["dist/index.js"] }));

const { tools } = await client.listTools();
console.log(`Tools: ${tools.map((t) => t.name).join(", ")}\n`);

const calls = [
  ["get_scores", { include_goals: true }],
  ["get_scores", { date: "2026-11-15", include_goals: true }],
  ["get_standings", { group: "conference" }],
  ["search_players", { name: "Hughes", active_only: true }],
  ["get_player_stats", { player: "McDavid" }],
  ["get_player_stats", { player: "Ullmark" }],
  ["get_team_schedule", { team: "leafs", mode: "recent", count: 3 }],
  ["get_team_schedule", { team: "Habs" }],
  ["get_team_roster", { team: "EDM" }],
  ["get_league_leaders", { category: "points", limit: 5 }],
  ["get_league_leaders", { category: "savePctg", limit: 3 }],
  ["get_league_leaders", { category: "toi", limit: 3 }],
  ["get_league_leaders", { category: "faceoffLeaders", limit: 3 }],
  ["get_team_schedule", { team: "Quebec Nordiques" }], // expected error
];

let failures = 0;
for (const [name, args] of calls) {
  const res = await client.callTool({ name, arguments: args });
  const out = res.content.map((c) => c.text).join("\n");
  console.log(`=== ${name} ${JSON.stringify(args)}${res.isError ? "  [isError]" : ""}\n${out}\n`);
  if (res.isError && !String(args.team).includes("Nordiques")) failures++;
}
await client.close();
if (failures) {
  console.error(`${failures} tool call(s) failed`);
  process.exit(1);
}
