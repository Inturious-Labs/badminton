// Types matching the JSON produced by data/export_json.py

export type Discipline = "MD" | "WD" | "XD";
export type Stage = "group" | "semifinal" | "final" | "third_place";
export type Gender = "M" | "F";

export interface Tournament {
  id: number;
  name: string;
  year: number;
  start_date: string | null;
  venue: string | null;
  notes: string | null;
}

export interface Group {
  id: number;
  name: string;
  team_ids: number[];
}

export interface RosterEntry {
  player_id: number;
  name: string;
  gender: Gender;
}

export interface Team {
  id: number;
  name: string;
  group_id: number | null;
  roster: RosterEntry[];
}

export interface Player {
  id: number;
  name: string;
  gender: Gender;
}

export interface Rubber {
  discipline: Discipline;
  a_players: [number, number];
  a_score: number;
  b_players: [number, number];
  b_score: number;
  winner_side: "a" | "b";
}

export interface Tie {
  id: number;
  stage: Stage;
  group_id: number | null;
  match_number: number | null;
  round_number: number | null;
  team_a_id: number;
  team_b_id: number;
  a_rubbers_won: number;
  b_rubbers_won: number;
  a_points: number;
  b_points: number;
  winner_team_id: number;
  rubbers: Rubber[];
}

export interface Standing {
  group_id: number;
  rank: number;
  team_id: number;
  ties_won: number;
  ties_lost: number;
  rubbers_won: number;
  rubbers_lost: number;
  points_for: number;
  points_against: number;
  tiebreak_note: string;
  advances: boolean;
}

export interface PairStat {
  team_id: number;
  discipline: Discipline;
  player_ids: [number, number];
  games_played: number;
  games_won: number;
  points_for: number;
  points_against: number;
  deployments: { tie_id: number; our_score: number; opp_score: number }[];
}

export interface UnusedPair {
  team_id: number;
  discipline: Discipline;
  player_ids: [number, number];
}

export interface TournamentData {
  tournament: Tournament;
  groups: Group[];
  teams: Team[];
  players: Player[];
  ties: Tie[];
  standings: Standing[];
  pair_stats: PairStat[];
  unused_pairs: UnusedPair[];
}
