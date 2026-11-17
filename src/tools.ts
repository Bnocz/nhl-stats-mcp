import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  GOALIE_CATEGORIES,
  SKATER_CATEGORIES,
  formatLeaders,
  formatPlayer,
  formatPlayerSearch,
  formatRoster,
  formatSchedule,
  formatScores,
  formatStandings,
  type LeaderCategory,
} from "./format.js";
import { NhlApiError, NhlClient, type PlayerSearchResult } from "./nhl-client.js";
import { resolveTeam, teamList } from "./teams.js";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional()
  .describe("Date in YYYY-MM-DD format. Omit for today (US Eastern time).");

const teamSchema = z
  .string()
  .min(2)
  .describe('Team abbreviation or name, e.g. "TOR", "Leafs", "Toronto Maple Leafs", "Habs"');

const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const text = (t: string): ToolResult => ({ content: [{ type: "text", text: t }] });
const fail = (t: string): ToolResult => ({ content: [{ type: "text", text: t }], isError: true });

/** Wrap a handler so API failures come back to the model as readable tool errors instead of crashing. */
function safe<A>(handler: (args: A) => Promise<ToolResult>) {
  return async (args: A): Promise<ToolResult> => {
    try {
      return await handler(args);
    } catch (err) {
      if (err instanceof NhlApiError) return fail(err.message);
      throw err;
    }
  };
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Pick the best match from a name search: exact name first, then active players. */
export function pickPlayer(query: string, results: PlayerSearchResult[]): PlayerSearchResult | undefined {
  const q = fold(query);
  return (
    results.find((r) => fold(r.name) === q && r.active) ??
    results.find((r) => fold(r.name) === q) ??
    results.find((r) => r.active) ??
    results[0]
  );
}

export function registerTools(server: McpServer, client = new NhlClient()) {
  server.registerTool(
    "get_scores",
    {
      title: "NHL scores",
      description:
        "Get NHL games for a date: live scores with period and clock, final scores, or start times for upcoming games. " +
        "Set include_goals to list every goal with scorer, assists and strength.",
      inputSchema: {
        date: dateSchema,
        include_goals: z.boolean().optional().default(false).describe("List each goal scored in started games"),
      },
      annotations: READ_ONLY,
    },
    safe(async ({ date, include_goals }) => {
      const data = await client.scores(date);
      const day = date ?? data.currentDate;
      // score/{date} can include games from neighbouring days; keep only the requested one.
      const games = data.games.filter((g) => g.gameDate === day);
      return text(formatScores(day, games, include_goals));
    }),
  );

  server.registerTool(
    "get_standings",
    {
      title: "NHL standings",
      description:
        "Get NHL standings (W-L-OTL, points, point %, goal differential, last 10, streak), grouped league-wide, by conference or by division.",
      inputSchema: {
        group: z.enum(["league", "conference", "division"]).optional().default("division"),
        date: dateSchema,
      },
      annotations: READ_ONLY,
    },
    safe(async ({ group, date }) => {
      const data = await client.standings(date);
      return text(formatStandings(data.standings, group));
    }),
  );

  server.registerTool(
    "search_players",
    {
      title: "Search NHL players",
      description:
        "Find NHL players (current and retired) by name. Returns player ids, positions and teams. " +
        "Use this when a name is ambiguous before calling get_player_stats.",
      inputSchema: {
        name: z.string().min(2).describe("Full or partial player name"),
        active_only: z.boolean().optional().default(false),
      },
      annotations: READ_ONLY,
    },
    safe(async ({ name, active_only }) => {
      let results = await client.searchPlayers(name, 20);
      if (active_only) results = results.filter((r) => r.active);
      if (results.length === 0) return text(`No players found matching "${name}".`);
      return text(formatPlayerSearch(results));
    }),
  );

  server.registerTool(
    "get_player_stats",
    {
      title: "NHL player stats",
      description:
        "Get a player's profile, current-season and career regular-season stats, and their last 5 games. " +
        "Accepts a player name (e.g. \"McDavid\") or a numeric NHL player id. Works for skaters and goalies.",
      inputSchema: {
        player: z.string().min(2).describe("Player name or 7-digit NHL player id"),
      },
      annotations: READ_ONLY,
    },
    safe(async ({ player }) => {
      let id: number;
      let note = "";
      if (/^\d{7}$/.test(player.trim())) {
        id = Number(player.trim());
      } else {
        const results = await client.searchPlayers(player, 10);
        const best = pickPlayer(player, results);
        if (!best) return fail(`No player found matching "${player}". Try search_players with a different spelling.`);
        id = Number(best.playerId);
        const others = results.filter((r) => r !== best).slice(0, 4);
        if (others.length && fold(best.name) !== fold(player)) {
          note = `\n\n(Matched "${player}" to ${best.name}. Other matches: ${others
            .map((o) => `${o.name} [id ${o.playerId}]`)
            .join(", ")})`;
        }
      }
      const landing = await client.player(id);
      return text(formatPlayer(landing) + note);
    }),
  );

  server.registerTool(
    "get_team_schedule",
    {
      title: "NHL team schedule",
      description: "Get a team's upcoming games (with start times) or recent results (W/L and score) for the current season.",
      inputSchema: {
        team: teamSchema,
        mode: z.enum(["upcoming", "recent"]).optional().default("upcoming"),
        count: z.number().int().min(1).max(30).optional().default(5),
      },
      annotations: READ_ONLY,
    },
    safe(async ({ team, mode, count }) => {
      const t = resolveTeam(team);
      if (!t) return fail(`Unknown team "${team}". Valid teams: ${teamList()}`);
      const data = await client.teamSchedule(t.abbrev);
      return text(formatSchedule(t.abbrev, data.games, mode, count));
    }),
  );

  server.registerTool(
    "get_team_roster",
    {
      title: "NHL team roster",
      description: "Get a team's current roster: forwards, defensemen and goalies with numbers, positions and player ids.",
      inputSchema: { team: teamSchema },
      annotations: READ_ONLY,
    },
    safe(async ({ team }) => {
      const t = resolveTeam(team);
      if (!t) return fail(`Unknown team "${team}". Valid teams: ${teamList()}`);
      const roster = await client.roster(t.abbrev);
      return text(formatRoster(t.name, roster));
    }),
  );

  const categories = [...Object.keys(SKATER_CATEGORIES), ...Object.keys(GOALIE_CATEGORIES)] as [
    LeaderCategory,
    ...LeaderCategory[],
  ];

  server.registerTool(
    "get_league_leaders",
    {
      title: "NHL league leaders",
      description:
        "Get the current season's NHL leaders in a stat category. Skater categories: " +
        Object.entries(SKATER_CATEGORIES)
          .map(([k, v]) => `${k} (${v})`)
          .join(", ") +
        ". Goalie categories: " +
        Object.entries(GOALIE_CATEGORIES)
          .map(([k, v]) => `${k} (${v})`)
          .join(", ") +
        ".",
      inputSchema: {
        category: z.enum(categories).optional().default("points"),
        limit: z.number().int().min(1).max(25).optional().default(10),
      },
      annotations: READ_ONLY,
    },
    safe(async ({ category, limit }) => {
      const isGoalie = category in GOALIE_CATEGORIES;
      const data = isGoalie
        ? await client.goalieLeaders(category, limit)
        : await client.skaterLeaders(category, limit);
      return text(formatLeaders(category, data[category] ?? []));
    }),
  );
}
