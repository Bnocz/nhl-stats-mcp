import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { NhlClient, type FetchLike, type PlayerSearchResult } from "./nhl-client.js";
import { resolveTeam } from "./teams.js";
import { pickPlayer, registerTools } from "./tools.js";

/** Spin up the real MCP server in-process, backed by a fake fetch, and return a connected client. */
async function connect(fetchImpl: FetchLike) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerTools(server, new NhlClient(fetchImpl));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const textOf = (res: Awaited<ReturnType<Client["callTool"]>>) =>
  (res.content as { text: string }[]).map((c) => c.text).join("\n");

describe("resolveTeam", () => {
  it.each([
    ["TOR", "TOR"],
    ["leafs", "TOR"],
    ["Toronto Maple Leafs", "TOR"],
    ["the Habs", "MTL"],
    ["Montreal", "MTL"],
    ["Montréal Canadiens", "MTL"],
    ["st. louis", "STL"],
    ["Vegas", "VGK"],
    ["new jersey", "NJD"],
  ])("%s -> %s", (input, abbrev) => {
    expect(resolveTeam(input)?.abbrev).toBe(abbrev);
  });

  it("refuses ambiguous or unknown names", () => {
    expect(resolveTeam("new york")).toBeUndefined();
    expect(resolveTeam("Nordiques")).toBeUndefined();
  });
});

describe("pickPlayer", () => {
  const p = (name: string, active: boolean, playerId = name): PlayerSearchResult => ({
    playerId,
    name,
    active,
    positionCode: "C",
    teamAbbrev: null,
    lastTeamAbbrev: null,
    sweaterNumber: null,
  });

  it("prefers an exact active name match, then any active player", () => {
    const results = [p("Brian McDavid", false), p("Connor McDavid", true)];
    expect(pickPlayer("connor mcdavid", results)?.name).toBe("Connor McDavid");
    expect(pickPlayer("McDavid", results)?.name).toBe("Connor McDavid");
  });

  it("ignores accents when matching", () => {
    expect(pickPlayer("Tim Sturzle", [p("Tim Stützle", true)])?.name).toBe("Tim Stützle");
  });
});

describe("MCP tools", () => {
  it("registers all seven tools with read-only annotations", async () => {
    const client = await connect(async () => json({}));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_league_leaders",
      "get_player_stats",
      "get_scores",
      "get_standings",
      "get_team_roster",
      "get_team_schedule",
      "search_players",
    ]);
    expect(tools.every((t) => t.annotations?.readOnlyHint)).toBe(true);
  });

  it("filters out games from neighbouring days", async () => {
    const client = await connect(async () =>
      json({
        currentDate: "2026-11-16",
        games: [
          { id: 1, gameDate: "2026-11-16", startTimeUTC: "2026-11-17T00:00:00Z", gameState: "FUT", awayTeam: { abbrev: "MTL" }, homeTeam: { abbrev: "NYR" } },
          { id: 2, gameDate: "2026-11-17", startTimeUTC: "2026-11-18T00:00:00Z", gameState: "FUT", awayTeam: { abbrev: "TOR" }, homeTeam: { abbrev: "CHI" } },
        ],
      }),
    );
    const out = textOf(await client.callTool({ name: "get_scores", arguments: {} }));
    expect(out).toContain("MTL @ NYR");
    expect(out).not.toContain("TOR");
  });

  it("calls the right endpoint for a resolved team name", async () => {
    const urls: string[] = [];
    const client = await connect(async (url) => {
      urls.push(url);
      return json({ games: [] });
    });
    await client.callTool({ name: "get_team_schedule", arguments: { team: "habs" } });
    expect(urls).toEqual(["https://api-web.nhle.com/v1/club-schedule-season/MTL/now"]);
  });

  it("returns a tool error (not a crash) for unknown teams", async () => {
    const client = await connect(async () => json({}));
    const res = await client.callTool({ name: "get_team_roster", arguments: { team: "Hartford Whalers" } });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("Unknown team");
  });

  it("turns API failures into readable tool errors", async () => {
    const client = await connect(async () => json({ message: "boom" }, 503));
    const res = await client.callTool({ name: "get_standings", arguments: {} });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toBe("The NHL API returned HTTP 503.");
  });

  it("turns network failures into readable tool errors", async () => {
    const client = await connect(async () => {
      throw new TypeError("fetch failed");
    });
    const res = await client.callTool({ name: "get_league_leaders", arguments: {} });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("Could not reach the NHL API");
  });

  it("rejects malformed dates before calling the API", async () => {
    let called = false;
    const client = await connect(async () => {
      called = true;
      return json({});
    });
    const res = await client.callTool({ name: "get_scores", arguments: { date: "Nov 15" } });
    expect(res.isError).toBe(true);
    expect(called).toBe(false);
  });
});
