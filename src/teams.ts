/**
 * The 32 NHL clubs, so tools can accept "Leafs", "toronto" or "TOR" interchangeably.
 */

export interface Team {
  abbrev: string;
  name: string;
  /** Extra names people commonly use. */
  aliases: string[];
}

export const TEAMS: Team[] = [
  { abbrev: "ANA", name: "Anaheim Ducks", aliases: ["ducks"] },
  { abbrev: "BOS", name: "Boston Bruins", aliases: ["bruins", "bs"] },
  { abbrev: "BUF", name: "Buffalo Sabres", aliases: ["sabres"] },
  { abbrev: "CGY", name: "Calgary Flames", aliases: ["flames"] },
  { abbrev: "CAR", name: "Carolina Hurricanes", aliases: ["hurricanes", "canes"] },
  { abbrev: "CHI", name: "Chicago Blackhawks", aliases: ["blackhawks", "hawks"] },
  { abbrev: "COL", name: "Colorado Avalanche", aliases: ["avalanche", "avs"] },
  { abbrev: "CBJ", name: "Columbus Blue Jackets", aliases: ["blue jackets", "jackets"] },
  { abbrev: "DAL", name: "Dallas Stars", aliases: ["stars"] },
  { abbrev: "DET", name: "Detroit Red Wings", aliases: ["red wings", "wings"] },
  { abbrev: "EDM", name: "Edmonton Oilers", aliases: ["oilers"] },
  { abbrev: "FLA", name: "Florida Panthers", aliases: ["panthers", "cats"] },
  { abbrev: "LAK", name: "Los Angeles Kings", aliases: ["kings", "la", "la kings"] },
  { abbrev: "MIN", name: "Minnesota Wild", aliases: ["wild"] },
  { abbrev: "MTL", name: "Montréal Canadiens", aliases: ["montreal", "canadiens", "habs"] },
  { abbrev: "NSH", name: "Nashville Predators", aliases: ["predators", "preds"] },
  { abbrev: "NJD", name: "New Jersey Devils", aliases: ["devils", "nj"] },
  { abbrev: "NYI", name: "New York Islanders", aliases: ["islanders", "isles"] },
  { abbrev: "NYR", name: "New York Rangers", aliases: ["rangers", "blueshirts"] },
  { abbrev: "OTT", name: "Ottawa Senators", aliases: ["senators", "sens"] },
  { abbrev: "PHI", name: "Philadelphia Flyers", aliases: ["flyers", "philly"] },
  { abbrev: "PIT", name: "Pittsburgh Penguins", aliases: ["penguins", "pens"] },
  { abbrev: "SJS", name: "San Jose Sharks", aliases: ["sharks", "sj"] },
  { abbrev: "SEA", name: "Seattle Kraken", aliases: ["kraken"] },
  { abbrev: "STL", name: "St. Louis Blues", aliases: ["st louis", "saint louis", "blues"] },
  { abbrev: "TBL", name: "Tampa Bay Lightning", aliases: ["lightning", "bolts", "tampa", "tb"] },
  { abbrev: "TOR", name: "Toronto Maple Leafs", aliases: ["maple leafs", "leafs"] },
  { abbrev: "UTA", name: "Utah Mammoth", aliases: ["utah", "mammoth"] },
  { abbrev: "VAN", name: "Vancouver Canucks", aliases: ["canucks", "nucks"] },
  { abbrev: "VGK", name: "Vegas Golden Knights", aliases: ["golden knights", "knights", "vegas"] },
  { abbrev: "WSH", name: "Washington Capitals", aliases: ["capitals", "caps", "washington"] },
  { abbrev: "WPG", name: "Winnipeg Jets", aliases: ["jets", "winnipeg"] },
];

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents: Montréal -> Montreal
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Resolve free-form input ("TOR", "leafs", "Toronto Maple Leafs", "the habs") to a team.
 * Returns undefined when nothing matches.
 */
export function resolveTeam(input: string): Team | undefined {
  const q = normalize(input).replace(/^the /, "");
  if (!q) return undefined;

  const exact = TEAMS.find(
    (t) =>
      t.abbrev.toLowerCase() === q ||
      normalize(t.name) === q ||
      t.aliases.some((a) => normalize(a) === q),
  );
  if (exact) return exact;

  // Partial match on the full name, e.g. "toronto" or "new jersey".
  const partial = TEAMS.filter((t) => normalize(t.name).includes(q));
  return partial.length === 1 ? partial[0] : undefined;
}

export function teamList(): string {
  return TEAMS.map((t) => `${t.abbrev} (${t.name})`).join(", ");
}
