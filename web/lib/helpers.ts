// Pure helpers — safe to import from both server and client components.
// No Node-only APIs (no fs, no path).
import type { PairStat, Player, Rubber, Standing, Team, Tie, TournamentData } from "./types";

export function getTeam(data: TournamentData, teamId: number): Team {
  const t = data.teams.find((t) => t.id === teamId);
  if (!t) throw new Error(`Team not found: ${teamId}`);
  return t;
}

export function getPlayer(data: TournamentData, playerId: number): Player {
  const p = data.players.find((p) => p.id === playerId);
  if (!p) throw new Error(`Player not found: ${playerId}`);
  return p;
}

export function playerName(data: TournamentData, playerId: number): string {
  return getPlayer(data, playerId).name;
}

export function pairLabel(data: TournamentData, ids: readonly number[]): string {
  return ids.map((id) => playerName(data, id)).join("/");
}

export function getStanding(data: TournamentData, teamId: number): Standing | undefined {
  return data.standings.find((s) => s.team_id === teamId);
}

export function getKnockoutTies(data: TournamentData): {
  semifinals: Tie[];
  final: Tie | undefined;
  thirdPlace: Tie | undefined;
} {
  const semifinals = data.ties.filter((t) => t.stage === "semifinal");
  const final = data.ties.find((t) => t.stage === "final");
  const thirdPlace = data.ties.find((t) => t.stage === "third_place");
  return { semifinals, final, thirdPlace };
}

export function getFinalRanking(data: TournamentData): {
  champion: number | undefined;
  runnerUp: number | undefined;
  third: number | undefined;
  fourth: number | undefined;
  jointEighth: number[];
} {
  const { final, thirdPlace } = getKnockoutTies(data);
  const champion = final?.winner_team_id;
  const runnerUp = final
    ? final.winner_team_id === final.team_a_id
      ? final.team_b_id
      : final.team_a_id
    : undefined;
  const third = thirdPlace?.winner_team_id;
  const fourth = thirdPlace
    ? thirdPlace.winner_team_id === thirdPlace.team_a_id
      ? thirdPlace.team_b_id
      : thirdPlace.team_a_id
    : undefined;
  const advanceIds = new Set([champion, runnerUp, third, fourth].filter(Boolean) as number[]);
  const jointEighth = data.teams.filter((t) => !advanceIds.has(t.id)).map((t) => t.id);
  return { champion, runnerUp, third, fourth, jointEighth };
}

export function getTiesForTeam(data: TournamentData, teamId: number): Tie[] {
  return data.ties.filter((t) => t.team_a_id === teamId || t.team_b_id === teamId);
}

export function getPairStatsForTeam(data: TournamentData, teamId: number): PairStat[] {
  return data.pair_stats.filter((p) => p.team_id === teamId);
}

export function describeRubber(rubber: Rubber): string {
  const aWon = rubber.winner_side === "a";
  return `${rubber.a_score}-${rubber.b_score}${aWon ? " (A)" : " (B)"}`;
}

// Surprise ascender = a team flagged as `advances` even though their group rank > 2.
// (Useful for highlighting tiebreaker upsets.)
export function getSurpriseAdvancers(data: TournamentData): Set<number> {
  const surprises = new Set<number>();
  for (const s of data.standings) {
    if (s.advances && s.rank > 2) surprises.add(s.team_id);
  }
  return surprises;
}

// Group-stage discipline W-L per team. Each team plays exactly 5 ties in the
// round-robin, so each (team, discipline) row has wins+losses === 5.
export interface DisciplineRecord {
  team_id: number;
  team_name: string;
  group_id: number;
  total_wins: number; // sum of wins across MD+XD+WD = team's tie wins counted thrice... no, see below
  per_discipline: {
    MD: { wins: number; losses: number };
    XD: { wins: number; losses: number };
    WD: { wins: number; losses: number };
  };
}

export function getDisciplineRecords(data: TournamentData): DisciplineRecord[] {
  const tiesByid = new Map(data.ties.map((t) => [t.id, t]));
  const recordsByTeam = new Map<number, DisciplineRecord>();

  for (const team of data.teams) {
    recordsByTeam.set(team.id, {
      team_id: team.id,
      team_name: team.name,
      group_id: team.group_id ?? 0,
      total_wins: 0,
      per_discipline: {
        MD: { wins: 0, losses: 0 },
        XD: { wins: 0, losses: 0 },
        WD: { wins: 0, losses: 0 },
      },
    });
  }

  // Walk every pair_stat deployment, filter to group-stage rubbers
  for (const ps of data.pair_stats) {
    const rec = recordsByTeam.get(ps.team_id);
    if (!rec) continue;
    for (const d of ps.deployments) {
      const tie = tiesByid.get(d.tie_id);
      if (!tie || tie.stage !== "group") continue;
      const won = d.our_score > d.opp_score;
      if (won) rec.per_discipline[ps.discipline].wins += 1;
      else rec.per_discipline[ps.discipline].losses += 1;
    }
  }

  // total_wins for sorting: sum of (MD wins + XD wins + WD wins). This equals
  // the team's total rubbers won across the 5 group-stage ties.
  for (const rec of recordsByTeam.values()) {
    rec.total_wins =
      rec.per_discipline.MD.wins +
      rec.per_discipline.XD.wins +
      rec.per_discipline.WD.wins;
  }

  return Array.from(recordsByTeam.values()).sort(
    (a, b) => b.total_wins - a.total_wins || a.team_name.localeCompare(b.team_name, "zh"),
  );
}
