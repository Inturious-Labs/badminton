"""Export the loaded tournament as a single JSON file for the static web page.

Usage:
    python export_json.py [--out tournament.json]

Output schema (per tournament):
  {
    "tournament":  { id, name, year, start_date, venue, notes },
    "groups":      [{ id, name, team_ids: [...] }, ...],
    "teams":       [{ id, name, group_id, roster: [{player_id, name, gender}, ...] }, ...],
    "players":     [{ id, name, gender }, ...],
    "ties":        [{ id, stage, group_id, match_number, team_a_id, team_b_id,
                      a_rubbers_won, b_rubbers_won, a_points, b_points, winner_team_id,
                      rubbers: [{ discipline, a_players, a_score, b_players, b_score, winner_side }, ...] }, ...],
    "standings":   [{ group_id, rank, team_id, ties_won, ties_lost,
                      rubbers_won, rubbers_lost, points_for, points_against, tiebreak_note, advances }, ...],
    "pair_stats":  [{ team_id, discipline, player_ids, games_played, games_won,
                      points_for, points_against, deployments: [{tie_id, our_score, opp_score}] }, ...],
    "unused_pairs":[{ team_id, discipline, player_ids }, ...]
  }
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

from analyze import (
    compute_group_records,
    rank_group,
    collect_pair_stats,
    all_possible_pairs,
    pair_key,
)
from db import connect


def export(out_path: Path) -> None:
    with connect() as conn:
        tournament = conn.execute(
            "SELECT * FROM tournaments ORDER BY year DESC, id DESC LIMIT 1"
        ).fetchone()
        if not tournament:
            raise RuntimeError("No tournament in DB. Seed first.")
        tid = tournament["id"]

        # Groups
        group_rows = conn.execute(
            "SELECT id, name FROM groups WHERE tournament_id = ? ORDER BY name", (tid,)
        ).fetchall()
        group_teams: dict[int, list[int]] = {}
        for g in group_rows:
            tm = conn.execute(
                "SELECT team_id FROM group_memberships WHERE group_id = ? ORDER BY team_id",
                (g["id"],),
            ).fetchall()
            group_teams[g["id"]] = [r["team_id"] for r in tm]
        groups_json = [
            {"id": g["id"], "name": g["name"], "team_ids": group_teams[g["id"]]}
            for g in group_rows
        ]

        # Teams (with group + roster)
        teams_rows = conn.execute(
            "SELECT id, name FROM teams WHERE tournament_id = ? ORDER BY name", (tid,)
        ).fetchall()
        team_to_group = {t: g_id for g_id, members in group_teams.items() for t in members}
        teams_json = []
        for t in teams_rows:
            roster = conn.execute(
                """SELECT p.id, p.primary_name, p.gender
                   FROM players p
                   JOIN team_rosters tr ON tr.player_id = p.id
                   WHERE tr.team_id = ?
                   ORDER BY p.gender DESC, p.id""",
                (t["id"],),
            ).fetchall()
            teams_json.append(
                {
                    "id": t["id"],
                    "name": t["name"],
                    "group_id": team_to_group.get(t["id"]),
                    "roster": [
                        {"player_id": r["id"], "name": r["primary_name"], "gender": r["gender"]}
                        for r in roster
                    ],
                }
            )

        # Players (full list)
        players_rows = conn.execute("SELECT id, primary_name, gender FROM players ORDER BY id").fetchall()
        players_json = [
            {"id": p["id"], "name": p["primary_name"], "gender": p["gender"]}
            for p in players_rows
        ]

        # Ties + rubbers
        ties_rows = conn.execute(
            """SELECT tr.tie_id, tr.stage, tr.group_id, tr.team_a_id, tr.team_b_id,
                      tr.a_rubbers_won, tr.b_rubbers_won, tr.a_points, tr.b_points,
                      tr.winner_team_id, t.match_number, t.round_number
               FROM tie_results tr
               JOIN ties t ON t.id = tr.tie_id
               WHERE tr.tournament_id = ?
               ORDER BY tr.tie_id""",
            (tid,),
        ).fetchall()
        ties_json = []
        for trow in ties_rows:
            rubbers = conn.execute(
                """SELECT discipline, a_player1_id, a_player2_id, a_score,
                          b_player1_id, b_player2_id, b_score
                   FROM rubbers WHERE tie_id = ?
                   ORDER BY CASE discipline WHEN 'MD' THEN 1 WHEN 'XD' THEN 2 WHEN 'WD' THEN 3 END""",
                (trow["tie_id"],),
            ).fetchall()
            ties_json.append(
                {
                    "id": trow["tie_id"],
                    "stage": trow["stage"],
                    "group_id": trow["group_id"],
                    "match_number": trow["match_number"],
                    "round_number": trow["round_number"],
                    "team_a_id": trow["team_a_id"],
                    "team_b_id": trow["team_b_id"],
                    "a_rubbers_won": trow["a_rubbers_won"],
                    "b_rubbers_won": trow["b_rubbers_won"],
                    "a_points": trow["a_points"],
                    "b_points": trow["b_points"],
                    "winner_team_id": trow["winner_team_id"],
                    "rubbers": [
                        {
                            "discipline": r["discipline"],
                            "a_players": [r["a_player1_id"], r["a_player2_id"]],
                            "a_score": r["a_score"],
                            "b_players": [r["b_player1_id"], r["b_player2_id"]],
                            "b_score": r["b_score"],
                            "winner_side": "a" if r["a_score"] > r["b_score"] else "b",
                        }
                        for r in rubbers
                    ],
                }
            )

        # Standings (with tiebreakers applied)
        records_by_group = compute_group_records(conn, tid)
        standings_json = []
        for g_id, recs in records_by_group.items():
            if not any(r.ties_played for r in recs.values()):
                continue
            ranked = rank_group(recs)
            for rank, rec, note in ranked:
                standings_json.append(
                    {
                        "group_id": g_id,
                        "rank": rank,
                        "team_id": rec.team_id,
                        "ties_won": rec.ties_won,
                        "ties_lost": rec.ties_played - rec.ties_won,
                        "rubbers_won": rec.rubbers_won,
                        "rubbers_lost": rec.rubbers_lost,
                        "points_for": rec.points_for,
                        "points_against": rec.points_against,
                        "tiebreak_note": note,
                        "advances": rank <= 2,
                    }
                )

        # Pair stats per team
        pair_stats_json = []
        unused_pairs_json = []
        for t in teams_rows:
            stats = collect_pair_stats(conn, tid, t["id"])
            for s in stats.values():
                pair_stats_json.append(
                    {
                        "team_id": t["id"],
                        "discipline": s.discipline,
                        "player_ids": [s.pid1, s.pid2],
                        "games_played": s.games_played,
                        "games_won": s.games_won,
                        "points_for": s.points_for,
                        "points_against": s.points_against,
                        "deployments": [
                            {"tie_id": d[0], "our_score": d[1], "opp_score": d[2]}
                            for d in s.deployments
                        ],
                    }
                )
            used_keys = {(s.discipline, pair_key(s.pid1, s.pid2)) for s in stats.values()}
            possible = all_possible_pairs(conn, t["id"])
            for discipline in ("MD", "WD", "XD"):
                for p in possible[discipline]:
                    if (discipline, pair_key(*p)) not in used_keys:
                        unused_pairs_json.append(
                            {"team_id": t["id"], "discipline": discipline, "player_ids": list(p)}
                        )

        # Assemble
        tournament_json = {
            "tournament": {
                "id": tournament["id"],
                "name": tournament["name"],
                "year": tournament["year"],
                "start_date": tournament["start_date"],
                "venue": tournament["venue"],
                "notes": tournament["notes"],
            },
            "groups": groups_json,
            "teams": teams_json,
            "players": players_json,
            "ties": ties_json,
            "standings": standings_json,
            "pair_stats": pair_stats_json,
            "unused_pairs": unused_pairs_json,
        }

    out_path.write_text(json.dumps(tournament_json, ensure_ascii=False, indent=2), encoding="utf-8")
    size_kb = out_path.stat().st_size / 1024
    print(f"Wrote {out_path} ({size_kb:.1f} KB)")
    print(f"  teams={len(teams_json)}  players={len(players_json)}  ties={len(ties_json)}  pair_stats={len(pair_stats_json)}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--out", type=Path, default=Path(__file__).parent / "tournament.json"
    )
    args = parser.parse_args()
    export(args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
