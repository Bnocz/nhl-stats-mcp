import { describe, expect, it } from "vitest";
import {
  formatLeaderValue,
  formatPlayer,
  formatSchedule,
  formatScores,
  formatStandings,
  gameStatus,
  periodLabel,
} from "./format.js";
import type { PlayerLanding, ScheduleGame, ScoreGame, StandingRow } from "./nhl-client.js";

const game = (over: Partial<ScoreGame>): ScoreGame => ({
  id: 1,
  gameDate: "2026-11-15",
  startTimeUTC: "2026-11-16T00:00:00Z", // 7:00 PM Eastern
  gameState: "FUT",
  awayTeam: { abbrev: "EDM" },
  homeTeam: { abbrev: "PHI" },
  ...over,
});

describe("periodLabel", () => {
  it("labels regulation, overtime and shootout periods", () => {
    expect(periodLabel({ number: 1, periodType: "REG" })).toBe("1st");
    expect(periodLabel({ number: 3, periodType: "REG" })).toBe("3rd");
    expect(periodLabel({ number: 4, periodType: "OT" })).toBe("OT");
    expect(periodLabel({ number: 6, periodType: "OT" })).toBe("3OT"); // playoff triple overtime
    expect(periodLabel({ number: 5, periodType: "SO" })).toBe("SO");
  });
});

describe("gameStatus", () => {
  it("shows Eastern start time for future games", () => {
    expect(gameStatus(game({}))).toBe("Starts 7:00 PM ET");
  });

  it("shows period and clock for live games", () => {
    const live = game({
      gameState: "LIVE",
      periodDescriptor: { number: 2, periodType: "REG" },
      clock: { timeRemaining: "12:34", inIntermission: false },
    });
    expect(gameStatus(live)).toBe("LIVE, 2nd period, 12:34 left");
  });

  it("shows intermission", () => {
    const intermission = game({
      gameState: "LIVE",
      periodDescriptor: { number: 1, periodType: "REG" },
      clock: { timeRemaining: "00:00", inIntermission: true },
    });
    expect(gameStatus(intermission)).toBe("LIVE, 1st intermission");
  });

  it("marks overtime and shootout finals", () => {
    expect(gameStatus(game({ gameState: "OFF", gameOutcome: { lastPeriodType: "REG" } }))).toBe("Final");
    expect(gameStatus(game({ gameState: "FINAL", gameOutcome: { lastPeriodType: "OT" } }))).toBe("Final/OT");
    expect(gameStatus(game({ gameState: "OFF", gameOutcome: { lastPeriodType: "SO" } }))).toBe("Final/SO");
  });
});

describe("formatScores", () => {
  it("handles days without games", () => {
    expect(formatScores("2026-07-01", [], false)).toBe("No NHL games on 2026-07-01.");
  });

  it("lists scores, shots and goals", () => {
    const final = game({
      gameState: "OFF",
      gameOutcome: { lastPeriodType: "REG" },
      awayTeam: { abbrev: "EDM", score: 5, sog: 20 },
      homeTeam: { abbrev: "PHI", score: 2, sog: 31 },
      goals: [
        {
          period: 1,
          periodDescriptor: { number: 1, periodType: "REG" },
          timeInPeriod: "08:08",
          name: { default: "L. Draisaitl" },
          teamAbbrev: "EDM",
          strength: "pp",
          assists: [{ name: { default: "C. McDavid" } }, { name: { default: "E. Bouchard" } }],
        },
      ],
    });
    const out = formatScores("2026-11-15", [final], true);
    expect(out).toContain("EDM 5 @ PHI 2  Final  (shots 20-31)");
    expect(out).toContain("1st 08:08  EDM  L. Draisaitl (C. McDavid, E. Bouchard) [PP]");
  });
});

describe("formatSchedule", () => {
  const sched = (date: string, away: string, home: string, as: number, hs: number, last = "REG"): ScheduleGame => ({
    id: 1,
    gameDate: date,
    startTimeUTC: `${date}T23:00:00Z`,
    gameType: 2,
    gameState: "OFF",
    awayTeam: { abbrev: away, score: as },
    homeTeam: { abbrev: home, score: hs },
    gameOutcome: { lastPeriodType: last },
  });

  it("reports W, L and OTL from the team's perspective, newest first", () => {
    const games = [
      sched("2026-11-01", "TOR", "BOS", 4, 2),
      sched("2026-11-03", "MTL", "TOR", 3, 1),
      sched("2026-11-05", "TOR", "OTT", 2, 3, "OT"),
    ];
    const out = formatSchedule("TOR", games, "recent", 3);
    expect(out.split("\n").slice(1)).toEqual([
      "- 2026-11-05 @ OTT: OTL 2-3/OT",
      "- 2026-11-03 vs MTL: L 1-3",
      "- 2026-11-01 @ BOS: W 4-2",
    ]);
  });

  it("explains when there is nothing to show", () => {
    expect(formatSchedule("TOR", [], "upcoming", 5)).toContain("no remaining games");
  });
});

describe("formatStandings", () => {
  const row = (abbrev: string, division: string, divSeq: number, points: number): StandingRow =>
    ({
      conferenceName: "Eastern",
      divisionName: division,
      teamName: { default: abbrev },
      teamAbbrev: { default: abbrev },
      gamesPlayed: 10,
      wins: 5,
      losses: 3,
      otLosses: 2,
      points,
      pointPctg: 0.6,
      goalFor: 30,
      goalAgainst: 25,
      goalDifferential: 5,
      l10Wins: 5,
      l10Losses: 3,
      l10OtLosses: 2,
      leagueSequence: divSeq,
      conferenceSequence: divSeq,
      divisionSequence: divSeq,
      wildcardSequence: 0,
    }) as StandingRow;

  it("groups by division and sorts by rank", () => {
    const out = formatStandings(
      [row("TOR", "Atlantic", 2, 10), row("NYR", "Metropolitan", 1, 12), row("BOS", "Atlantic", 1, 12)],
      "division",
    );
    expect(out.indexOf("## Atlantic")).toBeLessThan(out.indexOf("## Metropolitan"));
    expect(out.indexOf("BOS")).toBeLessThan(out.indexOf("TOR"));
    expect(out).toContain("| .600 |");
    expect(out).toContain("| +5 |");
  });
});

describe("formatPlayer", () => {
  const base: PlayerLanding = {
    playerId: 1,
    isActive: true,
    firstName: { default: "Test" },
    lastName: { default: "Player" },
    fullTeamName: { default: "Edmonton Oilers" },
    sweaterNumber: 97,
    position: "C",
    birthDate: "1997-01-13",
    heightInInches: 74,
    weightInPounds: 190,
    shootsCatches: "L",
  };

  it("computes age around the birthday correctly", () => {
    expect(formatPlayer(base, new Date("2027-01-12T12:00:00Z"))).toContain("Age 29");
    expect(formatPlayer(base, new Date("2027-01-13T12:00:00Z"))).toContain("Age 30");
  });

  it("formats height and undrafted players", () => {
    const out = formatPlayer(base, new Date("2026-11-16"));
    expect(out).toContain(`6'2"`);
    expect(out).toContain("Undrafted");
  });

  it("uses goalie stat lines for goalies", () => {
    const goalie: PlayerLanding = {
      ...base,
      position: "G",
      featuredStats: {
        season: 20262027,
        regularSeason: {
          subSeason: { gamesPlayed: 10, wins: 9, losses: 1, otLosses: 0, goalsAgainstAvg: 1.4712, savePctg: 0.9386, shutouts: 0 },
        },
      },
    };
    const out = formatPlayer(goalie, new Date("2026-11-16"));
    expect(out).toContain("2026-27 regular season: 10 GP, 9-1-0 (W-L-OTL), 1.47 GAA, .939 SV%, 0 SO");
    expect(out).toContain("catches L");
  });
});

describe("formatLeaderValue", () => {
  it("formats each category's units", () => {
    expect(formatLeaderValue("savePctg", 0.938596)).toBe(".939");
    expect(formatLeaderValue("goalsAgainstAverage", 1.9)).toBe("1.90");
    expect(formatLeaderValue("faceoffLeaders", 0.6382)).toBe("63.8%");
    expect(formatLeaderValue("toi", 1683)).toBe("28:03");
    expect(formatLeaderValue("plusMinus", 12)).toBe("+12");
    expect(formatLeaderValue("points", 53)).toBe("53");
  });
});
