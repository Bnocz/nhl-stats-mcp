# nhl-stats-mcp

An [MCP](https://modelcontextprotocol.io) server that gives Claude (or any MCP-compatible AI assistant) **live NHL data**: scores, standings, schedules, rosters, player stats and league leaders.

No API key or sign-up needed. It uses the NHL's public web API.

> **You:** How are the Oilers doing, and how has McDavid played in his last few games?
>
> **Claude:** *(calls `get_standings` and `get_player_stats`)* Edmonton leads the Western Conference at 16-3-3 (35 pts) and has won five straight. McDavid leads the league with 53 points in 22 games, with 8 points over his last 5, including a 3-point night in Philadelphia…

<!-- TODO: add a demo GIF here, e.g. ![demo](docs/demo.gif) -->

## Tools

| Tool | What it does | Example question |
|---|---|---|
| `get_scores` | Live and final scores with period, clock and shots, plus optional goal-by-goal summaries | "Who scored in the Oilers game last night?" |
| `get_standings` | League, conference or division standings with points %, goal differential, L10 and streak | "Show me the Atlantic Division." |
| `get_player_stats` | Bio, current season, career and last 5 games, for skaters and goalies. Accepts a name or an id | "How is Ullmark doing this year?" |
| `search_players` | Find players (active or retired) by name | "Which Hughes brothers are in the NHL?" |
| `get_team_schedule` | Upcoming games or recent results with W/L/OTL | "When do the Leafs play next?" |
| `get_team_roster` | Current forwards, defense and goalies | "Who's on the Canucks' blue line?" |
| `get_league_leaders` | Leaders in points, goals, assists, +/-, PP/SH goals, PIM, TOI, faceoff %, wins, SV%, GAA and shutouts | "Who leads the league in save percentage?" |

Teams can be given as abbreviations, names or nicknames: `TOR`, `Leafs`, `Toronto Maple Leafs` and `the Habs` all work.

## Install

Requires Node.js 20+.

### Claude Code

```bash
claude mcp add nhl-stats -- npx -y nhl-stats-mcp
```

### Claude Desktop

Add this to `claude_desktop_config.json` (Settings → Developer → Edit Config) and restart Claude:

```json
{
  "mcpServers": {
    "nhl-stats": {
      "command": "npx",
      "args": ["-y", "nhl-stats-mcp"]
    }
  }
}
```

**On Windows**, Claude Desktop can't start `npx` directly (it's a `.cmd` script), so run it through `cmd`:

```json
{
  "mcpServers": {
    "nhl-stats": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "nhl-stats-mcp"]
    }
  }
}
```

### From source

```bash
git clone https://github.com/bnocz/nhl-stats-mcp.git
cd nhl-stats-mcp
npm install
npm run build
claude mcp add nhl-stats -- node "$(pwd)/dist/index.js"
```

## Development

```bash
npm run build     # compile TypeScript to dist/
npm test          # unit + in-process MCP tests (no network)
npm run smoke     # end-to-end: launches the server over stdio and calls every tool against the live API
npm run inspect   # open the MCP Inspector UI to try tools by hand
```

### Project layout

```
src/
  index.ts        entry point: starts the server on stdio
  tools.ts        tool definitions (zod input schemas + handlers)
  nhl-client.ts   typed HTTP client for the NHL API, with timeouts and error mapping
  format.ts       pure functions that turn raw API JSON into compact text
  teams.ts        the 32 clubs + fuzzy name resolution ("habs" -> MTL)
  *.test.ts       vitest suites
scripts/
  smoke.mjs       live end-to-end check using the official MCP client
```

## Design notes

- **Compact, model-friendly output.** NHL API responses are 50–200 KB of JSON. Each tool returns 1–3 KB of formatted text (markdown tables for standings, one line per game), so answers stay fast and fit easily in context.
- **Errors are tool results, not crashes.** Network failures, HTTP errors and bad input (an unknown team or a malformed date) come back as `isError` results with a readable message. The model can then recover, for example by retrying with a valid team.
- **Forgiving input.** Team nicknames, accent-insensitive player names ("Sturzle" matches "Stützle"), and name or id for players. When a name search is ambiguous, the result lists the other candidates.
- **Testable by construction.** The HTTP client takes an injectable `fetch`, and the formatters are pure functions. The test suite runs the real MCP server in-process over the SDK's in-memory transport, so the tests cover what a client actually sees, without touching the network.
- **Read-only.** Every tool sets `readOnlyHint`, so clients can call them without extra confirmation.

## Caveats

The NHL web API is public but unofficial and undocumented, so endpoints can change without notice. Times are shown in US Eastern.

## Roadmap

- [ ] MLB support via `statsapi.mlb.com` (same tool shapes, `sport` parameter)
- [ ] Playoff bracket tool
- [ ] Game box score / play-by-play tool
- [ ] Response caching for frequently repeated calls

## License

MIT
