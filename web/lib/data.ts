// Server-only: loads tournament.json from disk.
// Components that need pure data helpers should import from @/lib/helpers instead.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TournamentData } from "./types";

let cached: TournamentData | null = null;

// No standings overrides — rule-correct tiebreakers apply.
// In the 2026-05 tournament this means Group 2's 3-2 cluster ranks by net points:
//   包玉刚 (#2, +52)  ·  美校浦东 (#3, +42)  ·  诺达双语 (#4, +32)
// Note: 诺达双语 ranks last in the cluster but actually advanced to the semifinal,
// a surprise ascension that the chart and standings should highlight (not hide).
const STANDINGS_OVERRIDES: Record<string, Record<number, number>> = {};

// Teams that actually advanced to the knockout stage (may differ from rule-computed top-2
// when the organizer applied tiebreakers differently than the published rules).
// Used to mark "surprise" ascenders distinct from "expected" ascenders.
const ACTUAL_ADVANCERS: Record<string, Set<number>> = {
  "2026 上海国际及双语学校家长羽毛球春季赛": new Set([
    1, // 星河湾 (G1 #1, expected)
    2, // Concordia (G1 #2, expected)
    7, // 平和浦东 (G2 #1, expected)
    10, // 诺达双语 (G2 #4 by rules — SURPRISE ascension)
  ]),
};

export function loadTournament(): TournamentData {
  if (cached) return cached;
  const filePath = join(process.cwd(), "public", "tournament.json");
  const raw = readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw) as TournamentData;
  applyStandingsOverrides(data);
  applyActualAdvancers(data);
  cached = data;
  return cached;
}

function applyStandingsOverrides(data: TournamentData): void {
  const overrides = STANDINGS_OVERRIDES[data.tournament.name];
  if (!overrides) return;
  for (const s of data.standings) {
    if (overrides[s.team_id] !== undefined) {
      s.rank = overrides[s.team_id];
      s.advances = overrides[s.team_id] <= 2;
      s.tiebreak_note = "applied";
    }
  }
  data.standings.sort((a, b) => {
    if (a.group_id !== b.group_id) return a.group_id - b.group_id;
    return a.rank - b.rank;
  });
}

// Override `advances` based on who actually played the knockout stage,
// not who would have advanced per the published tiebreakers.
function applyActualAdvancers(data: TournamentData): void {
  const advancers = ACTUAL_ADVANCERS[data.tournament.name];
  if (!advancers) return;
  for (const s of data.standings) {
    s.advances = advancers.has(s.team_id);
  }
}


// Re-export pure helpers for convenience
export {
  describeRubber,
  getFinalRanking,
  getKnockoutTies,
  getPairStatsForTeam,
  getPlayer,
  getStanding,
  getSurpriseAdvancers,
  getTeam,
  getTiesForTeam,
  pairLabel,
  playerName,
} from "./helpers";
