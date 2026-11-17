/**
 * Thin client for the NHL's public (unofficial, keyless) web APIs.
 *
 * - api-web.nhle.com: scores, standings, schedules, rosters, player pages, leaders
 * - search.d3.nhle.com: player name search
 *
 * The fetch implementation is injectable so tests can run without the network.
 */

const WEB_API = "https://api-web.nhle.com/v1/";
const SEARCH_API = "https://search.d3.nhle.com/api/v1/";
const TIMEOUT_MS = 10_000;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class NhlApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "NhlApiError";
  }
}

/** Localized string as returned by the NHL API, e.g. { default: "Oilers", fr: "..." } */
export interface Localized {
  default: string;
  [lang: string]: string;
}

export interface GoalEvent {
  period: number;
  periodDescriptor?: { number: number; periodType: string };
  timeInPeriod: string;
  name: Localized;
  teamAbbrev: string;
  strength?: string;
  assists?: { name: Localized }[];
}

export interface ScoreTeam {
  abbrev: string;
  name?: Localized;
  score?: number;
  sog?: number;
}

export interface ScoreGame {
  id: number;
  gameDate: string;
  startTimeUTC: string;
  gameState: string; // FUT | PRE | LIVE | CRIT | FINAL | OFF
  venue?: Localized;
  awayTeam: ScoreTeam;
  homeTeam: ScoreTeam;
  periodDescriptor?: { number: number; periodType: string };
  clock?: { timeRemaining: string; inIntermission: boolean };
  gameOutcome?: { lastPeriodType: string };
  goals?: GoalEvent[];
}

export interface ScoreResponse {
  currentDate: string;
  games: ScoreGame[];
}

export interface StandingRow {
  conferenceName: string;
  divisionName: string;
  teamName: Localized;
  teamAbbrev: Localized;
  gamesPlayed: number;
  wins: number;
  losses: number;
  otLosses: number;
  points: number;
  pointPctg: number;
  goalFor: number;
  goalAgainst: number;
  goalDifferential: number;
  streakCode?: string;
  streakCount?: number;
  l10Wins: number;
  l10Losses: number;
  l10OtLosses: number;
  leagueSequence: number;
  conferenceSequence: number;
  divisionSequence: number;
  wildcardSequence: number;
}

export interface StandingsResponse {
  standings: StandingRow[];
}

export interface PlayerSearchResult {
  playerId: string;
  name: string;
  positionCode: string;
  teamAbbrev: string | null;
  lastTeamAbbrev: string | null;
  sweaterNumber: number | null;
  active: boolean;
}

export interface PlayerLanding {
  playerId: number;
  isActive: boolean;
  firstName: Localized;
  lastName: Localized;
  currentTeamAbbrev?: string;
  fullTeamName?: Localized;
  sweaterNumber?: number;
  position: string;
  birthDate: string;
  birthCity?: Localized;
  birthCountry?: string;
  heightInInches?: number;
  weightInPounds?: number;
  shootsCatches?: string;
  draftDetails?: { year: number; round: number; pickInRound: number; overallPick: number; teamAbbrev: string };
  featuredStats?: {
    season: number;
    regularSeason?: { subSeason?: Record<string, number>; career?: Record<string, number> };
  };
  last5Games?: Record<string, string | number>[];
}

export interface ScheduleGame {
  id: number;
  gameDate: string;
  startTimeUTC: string;
  gameType: number;
  gameState: string;
  venue?: Localized;
  awayTeam: { abbrev: string; score?: number };
  homeTeam: { abbrev: string; score?: number };
  gameOutcome?: { lastPeriodType: string };
}

export interface ScheduleResponse {
  games: ScheduleGame[];
}

export interface RosterPlayer {
  id: number;
  firstName: Localized;
  lastName: Localized;
  sweaterNumber?: number;
  positionCode: string;
  shootsCatches?: string;
  birthDate?: string;
  birthCountry?: string;
}

export interface RosterResponse {
  forwards: RosterPlayer[];
  defensemen: RosterPlayer[];
  goalies: RosterPlayer[];
}

export interface LeaderEntry {
  id: number;
  firstName: Localized;
  lastName: Localized;
  teamAbbrev: string;
  position: string;
  value: number;
}

export type LeadersResponse = Record<string, LeaderEntry[]>;

export class NhlClient {
  constructor(private readonly fetchImpl: FetchLike = globalThis.fetch) {}

  private async get<T>(url: string): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: { accept: "application/json" },
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new NhlApiError(`Could not reach the NHL API (${reason})`);
    }
    if (res.status === 404) {
      throw new NhlApiError("The NHL API has no data for that request (404).", 404);
    }
    if (!res.ok) {
      throw new NhlApiError(`The NHL API returned HTTP ${res.status}.`, res.status);
    }
    return (await res.json()) as T;
  }

  scores(date?: string) {
    return this.get<ScoreResponse>(`${WEB_API}score/${date ?? "now"}`);
  }

  standings(date?: string) {
    return this.get<StandingsResponse>(`${WEB_API}standings/${date ?? "now"}`);
  }

  searchPlayers(query: string, limit = 10) {
    const q = new URLSearchParams({ culture: "en-us", limit: String(limit), q: query });
    return this.get<PlayerSearchResult[]>(`${SEARCH_API}search/player?${q}`);
  }

  player(id: number) {
    return this.get<PlayerLanding>(`${WEB_API}player/${id}/landing`);
  }

  teamSchedule(team: string) {
    return this.get<ScheduleResponse>(`${WEB_API}club-schedule-season/${team}/now`);
  }

  roster(team: string) {
    return this.get<RosterResponse>(`${WEB_API}roster/${team}/current`);
  }

  skaterLeaders(category: string, limit: number) {
    const q = new URLSearchParams({ categories: category, limit: String(limit) });
    return this.get<LeadersResponse>(`${WEB_API}skater-stats-leaders/current?${q}`);
  }

  goalieLeaders(category: string, limit: number) {
    const q = new URLSearchParams({ categories: category, limit: String(limit) });
    return this.get<LeadersResponse>(`${WEB_API}goalie-stats-leaders/current?${q}`);
  }
}
