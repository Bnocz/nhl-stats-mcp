/**
 * Pure functions that turn raw NHL API JSON into compact, readable text for the model.
 *
 * Keeping these free of I/O makes them easy to unit test with fixtures, and keeps
 * tool output small: the raw API responses are 50-200 KB, the formatted text is ~1-3 KB.
 */
import type {
  GoalEvent,
  LeaderEntry,
  PlayerLanding,
  PlayerSearchResult,
  RosterResponse,
  ScheduleGame,
  ScoreGame,
  StandingRow,
} from "./nhl-client.js";

const EASTERN = "America/New_York";

export function easternTime(isoUtc: string): string {
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: EASTERN,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(isoUtc)) + " ET"
  );
}

export function periodLabel(desc?: { number: number; periodType: string }): string {
  if (!desc) return "";
  if (desc.periodType === "SO") return "SO";
  if (desc.periodType === "OT") {
    const otNumber = desc.number - 3;
    return otNumber > 1 ? `${otNumber}OT` : "OT";
  }
  return ["1st", "2nd", "3rd"][desc.number - 1] ?? `P${desc.number}`;
}

const isFinal = (state: string) => state === "FINAL" || state === "OFF";
const isLive = (state: string) => state === "LIVE" || state === "CRIT";

export function gameStatus(game: ScoreGame): string {
  if (isFinal(game.gameState)) {
    const last = game.gameOutcome?.lastPeriodType ?? game.periodDescriptor?.periodType;
    return last && last !== "REG" ? `Final/${last}` : "Final";
  }
  if (isLive(game.gameState)) {
    const period = periodLabel(game.periodDescriptor);
    if (game.clock?.inIntermission) return `LIVE, ${period} intermission`;
    return `LIVE, ${period} period, ${game.clock?.timeRemaining ?? "?"} left`;
  }
  if (game.gameState === "PPD") return "Postponed";
  return `Starts ${easternTime(game.startTimeUTC)}`;
}

function formatGoal(goal: GoalEvent): string {
  const assists = goal.assists?.length
    ? ` (${goal.assists.map((a) => a.name.default).join(", ")})`
    : " (unassisted)";
  const strength = goal.strength && goal.strength !== "ev" ? ` [${goal.strength.toUpperCase()}]` : "";
  const period = periodLabel(goal.periodDescriptor ?? { number: goal.period, periodType: "REG" });
  return `    ${period} ${goal.timeInPeriod}  ${goal.teamAbbrev}  ${goal.name.default}${assists}${strength}`;
}

export function formatScores(date: string, games: ScoreGame[], includeGoals: boolean): string {
  if (games.length === 0) return `No NHL games on ${date}.`;

  const lines = [`NHL games on ${date} (${games.length}):`, ""];
  for (const g of games) {
    const started = isLive(g.gameState) || isFinal(g.gameState);
    const away = g.awayTeam;
    const home = g.homeTeam;
    const matchup = started
      ? `${away.abbrev} ${away.score ?? 0} @ ${home.abbrev} ${home.score ?? 0}`
      : `${away.abbrev} @ ${home.abbrev}`;
    const shots = started && away.sog !== undefined ? `  (shots ${away.sog}-${home.sog})` : "";
    lines.push(`- ${matchup}  ${gameStatus(g)}${shots}`);
    if (includeGoals && g.goals?.length) {
      lines.push(...g.goals.map(formatGoal));
    }
  }
  return lines.join("\n");
}

export type StandingsGroup = "league" | "conference" | "division";

const pct = (n: number, digits = 3) => n.toFixed(digits).replace(/^0(?=\.)/, "");
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function standingsTable(rows: StandingRow[], rankKey: keyof StandingRow): string {
  const header = "| # | Team | GP | W | L | OTL | PTS | P% | GF | GA | DIFF | L10 | STRK |";
  const sep = "|---|---|---|---|---|---|---|---|---|---|---|---|---|";
  const body = [...rows]
    .sort((a, b) => (a[rankKey] as number) - (b[rankKey] as number))
    .map(
      (r) =>
        `| ${r[rankKey]} | ${r.teamAbbrev.default} ${r.teamName.default} | ${r.gamesPlayed} | ${r.wins} | ${r.losses} | ${r.otLosses} | ${r.points} | ${pct(r.pointPctg)} | ${r.goalFor} | ${r.goalAgainst} | ${signed(r.goalDifferential)} | ${r.l10Wins}-${r.l10Losses}-${r.l10OtLosses} | ${r.streakCode ?? ""}${r.streakCount ?? ""} |`,
    );
  return [header, sep, ...body].join("\n");
}

export function formatStandings(rows: StandingRow[], group: StandingsGroup): string {
  if (rows.length === 0) return "No standings available for that date (the season may not have started).";

  if (group === "league") {
    return `## NHL standings\n\n${standingsTable(rows, "leagueSequence")}`;
  }
  const key = group === "conference" ? "conferenceName" : "divisionName";
  const rankKey = group === "conference" ? "conferenceSequence" : "divisionSequence";
  const groups = new Map<string, StandingRow[]>();
  for (const r of rows) {
    const name = r[key];
    groups.set(name, [...(groups.get(name) ?? []), r]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, groupRows]) => `## ${name} ${group}\n\n${standingsTable(groupRows, rankKey)}`)
    .join("\n\n");
}

export function formatPlayerSearch(results: PlayerSearchResult[]): string {
  return results
    .map((p) => {
      const team = p.teamAbbrev ?? p.lastTeamAbbrev ?? "no team";
      const status = p.active ? team : `retired/inactive, last team ${p.lastTeamAbbrev ?? "?"}`;
      const num = p.sweaterNumber ? ` #${p.sweaterNumber}` : "";
      return `- ${p.name} (id ${p.playerId}): ${p.positionCode}${num}, ${status}`;
    })
    .join("\n");
}

function ageOn(birthDate: string, now: Date): number {
  const b = new Date(birthDate + "T00:00:00Z");
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const hadBirthday =
    now.getUTCMonth() > b.getUTCMonth() ||
    (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() >= b.getUTCDate());
  if (!hadBirthday) age--;
  return age;
}

const seasonLabel = (season: number) => {
  const s = String(season);
  return `${s.slice(0, 4)}-${s.slice(6, 8)}`;
};

function statLine(stats: Record<string, number> | undefined, goalie: boolean): string {
  if (!stats) return "no games played";
  if (goalie) {
    return [
      `${stats.gamesPlayed ?? 0} GP`,
      `${stats.wins ?? 0}-${stats.losses ?? 0}-${stats.otLosses ?? 0} (W-L-OTL)`,
      `${(stats.goalsAgainstAvg ?? 0).toFixed(2)} GAA`,
      `${pct(stats.savePctg ?? 0)} SV%`,
      `${stats.shutouts ?? 0} SO`,
    ].join(", ");
  }
  return [
    `${stats.gamesPlayed ?? 0} GP`,
    `${stats.goals ?? 0} G`,
    `${stats.assists ?? 0} A`,
    `${stats.points ?? 0} PTS`,
    `${signed(stats.plusMinus ?? 0)} +/-`,
    `${stats.powerPlayPoints ?? 0} PPP`,
    `${stats.shots ?? 0} shots`,
    `${((stats.shootingPctg ?? 0) * 100).toFixed(1)}% shooting`,
  ].join(", ");
}

function formatRecentGame(g: Record<string, string | number>, goalie: boolean): string {
  const where = g.homeRoadFlag === "H" ? "vs" : "@";
  const head = `    ${g.gameDate} ${where} ${g.opponentAbbrev}: `;
  if (goalie) {
    const decision = g.decision ? `${g.decision}, ` : "";
    const svPct = typeof g.savePctg === "number" ? pct(g.savePctg) : "?";
    return `${head}${decision}${g.shotsAgainst ?? "?"} shots, ${g.goalsAgainst ?? "?"} GA, ${svPct} SV%, TOI ${g.toi ?? "?"}`;
  }
  return `${head}${g.goals}G ${g.assists}A ${g.points}P, ${signed(Number(g.plusMinus ?? 0))}, ${g.shots} shots, TOI ${g.toi}`;
}

export function formatPlayer(p: PlayerLanding, now: Date = new Date()): string {
  const goalie = p.position === "G";
  const name = `${p.firstName.default} ${p.lastName.default}`;
  const team = p.isActive ? (p.fullTeamName?.default ?? p.currentTeamAbbrev ?? "free agent") : "inactive/retired";
  const num = p.sweaterNumber ? ` #${p.sweaterNumber}` : "";

  const lines = [`## ${name}${num}: ${p.position}, ${team}`];

  const bio: string[] = [`Age ${ageOn(p.birthDate, now)} (born ${p.birthDate}`];
  bio[0] += p.birthCity ? `, ${p.birthCity.default}${p.birthCountry ? `, ${p.birthCountry}` : ""})` : ")";
  if (p.heightInInches) bio.push(`${Math.floor(p.heightInInches / 12)}'${p.heightInInches % 12}"`);
  if (p.weightInPounds) bio.push(`${p.weightInPounds} lb`);
  if (p.shootsCatches) bio.push(`${goalie ? "catches" : "shoots"} ${p.shootsCatches}`);
  lines.push(bio.join(", "));
  if (p.draftDetails) {
    const d = p.draftDetails;
    lines.push(`Drafted ${d.year} by ${d.teamAbbrev}, round ${d.round}, #${d.overallPick} overall`);
  } else {
    lines.push("Undrafted");
  }

  const featured = p.featuredStats;
  if (featured?.regularSeason) {
    lines.push("");
    lines.push(`${seasonLabel(featured.season)} regular season: ${statLine(featured.regularSeason.subSeason, goalie)}`);
    lines.push(`Career regular season: ${statLine(featured.regularSeason.career, goalie)}`);
  }

  if (p.last5Games?.length) {
    lines.push("", "Last 5 games:", ...p.last5Games.map((g) => formatRecentGame(g, goalie)));
  }
  return lines.join("\n");
}

export function formatSchedule(
  teamAbbrev: string,
  games: ScheduleGame[],
  mode: "upcoming" | "recent",
  count: number,
): string {
  const relevant =
    mode === "upcoming"
      ? games.filter((g) => !isFinal(g.gameState)).slice(0, count)
      : games.filter((g) => isFinal(g.gameState)).slice(-count).reverse();

  if (relevant.length === 0) {
    return mode === "upcoming"
      ? `${teamAbbrev} has no remaining games on its schedule this season.`
      : `${teamAbbrev} has not finished any games yet this season.`;
  }

  const typeTag = (g: ScheduleGame) => (g.gameType === 1 ? " [preseason]" : g.gameType === 3 ? " [playoffs]" : "");

  const lines = relevant.map((g) => {
    const home = g.homeTeam.abbrev === teamAbbrev;
    const opp = home ? g.awayTeam.abbrev : g.homeTeam.abbrev;
    const where = home ? "vs" : "@";
    if (mode === "upcoming") {
      const status = isLive(g.gameState) ? "LIVE NOW" : easternTime(g.startTimeUTC);
      return `- ${g.gameDate} ${where} ${opp}, ${status}${typeTag(g)}`;
    }
    const us = (home ? g.homeTeam.score : g.awayTeam.score) ?? 0;
    const them = (home ? g.awayTeam.score : g.homeTeam.score) ?? 0;
    const extra = g.gameOutcome && g.gameOutcome.lastPeriodType !== "REG" ? `/${g.gameOutcome.lastPeriodType}` : "";
    const result = us > them ? "W" : extra ? "OTL" : "L";
    return `- ${g.gameDate} ${where} ${opp}: ${result} ${us}-${them}${extra}${typeTag(g)}`;
  });

  const title = mode === "upcoming" ? `Next ${relevant.length} ${teamAbbrev} games` : `Last ${relevant.length} ${teamAbbrev} results (most recent first)`;
  return `${title}:\n${lines.join("\n")}`;
}

export function formatRoster(teamName: string, roster: RosterResponse): string {
  const section = (title: string, players: RosterResponse["forwards"]) =>
    `${title} (${players.length}):\n` +
    [...players]
      .sort((a, b) => (a.sweaterNumber ?? 999) - (b.sweaterNumber ?? 999))
      .map(
        (p) =>
          `- #${p.sweaterNumber ?? "–"} ${p.firstName.default} ${p.lastName.default}, ${p.positionCode}` +
          `${p.shootsCatches ? `, ${p.shootsCatches}` : ""}${p.birthCountry ? `, ${p.birthCountry}` : ""} (id ${p.id})`,
      )
      .join("\n");

  return [
    `## ${teamName} current roster`,
    section("Forwards", roster.forwards),
    section("Defense", roster.defensemen),
    section("Goalies", roster.goalies),
  ].join("\n\n");
}

export const SKATER_CATEGORIES = {
  points: "Points",
  goals: "Goals",
  assists: "Assists",
  plusMinus: "Plus/minus",
  goalsPp: "Power-play goals",
  goalsSh: "Shorthanded goals",
  penaltyMins: "Penalty minutes",
  toi: "Time on ice per game",
  faceoffLeaders: "Faceoff win %",
} as const;

export const GOALIE_CATEGORIES = {
  wins: "Wins",
  savePctg: "Save %",
  goalsAgainstAverage: "Goals-against average",
  shutouts: "Shutouts",
} as const;

export type LeaderCategory = keyof typeof SKATER_CATEGORIES | keyof typeof GOALIE_CATEGORIES;

export function formatLeaderValue(category: string, value: number): string {
  switch (category) {
    case "savePctg":
      return pct(value);
    case "goalsAgainstAverage":
      return value.toFixed(2);
    case "faceoffLeaders":
      return `${(value * 100).toFixed(1)}%`;
    case "toi": {
      const total = Math.round(value);
      return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
    }
    case "plusMinus":
      return signed(value);
    default:
      return String(value);
  }
}

export function formatLeaders(category: LeaderCategory, entries: LeaderEntry[]): string {
  const label =
    (SKATER_CATEGORIES as Record<string, string>)[category] ?? (GOALIE_CATEGORIES as Record<string, string>)[category];
  if (entries.length === 0) return `No leaders available for ${label} yet.`;
  const lines = entries.map(
    (e, i) =>
      `${i + 1}. ${e.firstName.default} ${e.lastName.default} (${e.teamAbbrev}, ${e.position}): ${formatLeaderValue(category, e.value)}`,
  );
  return `NHL leaders, ${label} (current season):\n${lines.join("\n")}`;
}
