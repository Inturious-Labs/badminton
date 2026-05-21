"""Descriptive analytics for the team tournament.

Usage:
    python analyze.py                         # full report, all teams
    python analyze.py --team 包玉刚           # focused on one team
    python analyze.py --section standings     # just the standings
    python analyze.py --section pairs --team 包玉刚

Sections:
  standings  - Group standings with full tiebreaker chain
  ties       - Per-tie summary (who beat whom, by what score)
  pairs      - Pair-level deployments and outcomes (per team)
  matchups   - Pair vs pair: who played whom and the result
  unused     - Pairings the team did NOT deploy (latent options)
"""
from __future__ import annotations

import argparse
import itertools
import sqlite3
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

from db import connect


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------

def get_tournament(conn: sqlite3.Connection) -> sqlite3.Row:
    rows = conn.execute("SELECT * FROM tournaments ORDER BY year DESC, id DESC").fetchall()
    if not rows:
        raise RuntimeError("No tournament loaded — run seed.py first")
    if len(rows) > 1:
        print(f"WARNING: {len(rows)} tournaments found, using the most recent", file=sys.stderr)
    return rows[0]


def pair_key(pid1: int, pid2: int) -> tuple[int, int]:
    """Order-independent pair key."""
    return (pid1, pid2) if pid1 < pid2 else (pid2, pid1)


def pair_names(conn: sqlite3.Connection, pid1: int, pid2: int) -> str:
    rows = conn.execute(
        "SELECT primary_name FROM players WHERE id IN (?, ?) ORDER BY id",
        (pid1, pid2),
    ).fetchall()
    return "/".join(r["primary_name"] for r in rows)


def player_name(conn: sqlite3.Connection, pid: int) -> str:
    return conn.execute("SELECT primary_name FROM players WHERE id = ?", (pid,)).fetchone()["primary_name"]


def team_name(conn: sqlite3.Connection, tid: int) -> str:
    return conn.execute("SELECT name FROM teams WHERE id = ?", (tid,)).fetchone()["name"]


# ----------------------------------------------------------------------
# Section: Group standings (with full tiebreaker chain)
# ----------------------------------------------------------------------

@dataclass
class TeamRecord:
    team_id: int
    team_name: str
    ties_played: int = 0
    ties_won: int = 0
    rubbers_won: int = 0
    rubbers_lost: int = 0
    points_for: int = 0
    points_against: int = 0
    head_to_head: dict[int, bool] = field(default_factory=dict)  # opponent_id -> won?

    @property
    def net_rubbers(self) -> int:
        return self.rubbers_won - self.rubbers_lost

    @property
    def net_points(self) -> int:
        return self.points_for - self.points_against


def compute_group_records(conn: sqlite3.Connection, tournament_id: int) -> dict[int, dict[int, TeamRecord]]:
    """Returns {group_id: {team_id: TeamRecord}}."""
    groups: dict[int, dict[int, TeamRecord]] = defaultdict(dict)
    membership = conn.execute(
        """SELECT gm.group_id, gm.team_id, t.name
           FROM group_memberships gm
           JOIN teams t ON t.id = gm.team_id
           WHERE t.tournament_id = ?""",
        (tournament_id,),
    ).fetchall()
    for m in membership:
        groups[m["group_id"]][m["team_id"]] = TeamRecord(
            team_id=m["team_id"], team_name=m["name"]
        )

    ties = conn.execute(
        """SELECT tr.tie_id, tr.team_a_id, tr.team_b_id, tr.group_id,
                  tr.a_rubbers_won, tr.b_rubbers_won, tr.a_points, tr.b_points,
                  tr.winner_team_id
           FROM tie_results tr
           WHERE tr.stage = 'group'""",
    ).fetchall()

    for t in ties:
        if t["group_id"] not in groups:
            continue
        ra = groups[t["group_id"]][t["team_a_id"]]
        rb = groups[t["group_id"]][t["team_b_id"]]
        ra.ties_played += 1
        rb.ties_played += 1
        ra.rubbers_won += t["a_rubbers_won"]
        ra.rubbers_lost += t["b_rubbers_won"]
        rb.rubbers_won += t["b_rubbers_won"]
        rb.rubbers_lost += t["a_rubbers_won"]
        ra.points_for += t["a_points"]
        ra.points_against += t["b_points"]
        rb.points_for += t["b_points"]
        rb.points_against += t["a_points"]
        if t["winner_team_id"] == ra.team_id:
            ra.ties_won += 1
            ra.head_to_head[rb.team_id] = True
            rb.head_to_head[ra.team_id] = False
        else:
            rb.ties_won += 1
            rb.head_to_head[ra.team_id] = True
            ra.head_to_head[rb.team_id] = False

    return groups


def rank_group(records: dict[int, TeamRecord]) -> list[tuple[int, TeamRecord, str]]:
    """Returns sorted [(rank, record, tiebreak_note)] for a single group.

    Applies the rulebook tiebreakers:
      1. Most ties won
      2. If 2 teams tied: head-to-head
      3. If 3+ teams tied: net rubbers → net points → total points → H2H
    """
    by_wins: dict[int, list[TeamRecord]] = defaultdict(list)
    for r in records.values():
        by_wins[r.ties_won].append(r)

    ordered: list[tuple[TeamRecord, str]] = []
    for wins in sorted(by_wins, reverse=True):
        group = by_wins[wins]
        if len(group) == 1:
            ordered.append((group[0], ""))
        elif len(group) == 2:
            # head-to-head decides
            a, b = group
            if a.head_to_head.get(b.team_id):
                ordered.append((a, "H2H"))
                ordered.append((b, "H2H"))
            else:
                ordered.append((b, "H2H"))
                ordered.append((a, "H2H"))
        else:
            # 3+ tied: net rubbers, net points, total points, H2H within tied group
            def sort_key(r: TeamRecord):
                # H2H within the tied subset: count wins vs other tied teams
                h2h_wins = sum(1 for o in group if o is not r and r.head_to_head.get(o.team_id))
                return (r.net_rubbers, r.net_points, r.points_for, h2h_wins)
            tied = sorted(group, key=sort_key, reverse=True)
            for r in tied:
                ordered.append((r, "3-way"))

    return [(idx + 1, rec, note) for idx, (rec, note) in enumerate(ordered)]


def print_standings(conn: sqlite3.Connection, tournament_id: int) -> None:
    groups = compute_group_records(conn, tournament_id)
    group_names = {
        row["id"]: row["name"]
        for row in conn.execute(
            "SELECT id, name FROM groups WHERE tournament_id = ?", (tournament_id,)
        )
    }

    for group_id in sorted(groups):
        gname = group_names[group_id]
        records = groups[group_id]
        if not any(r.ties_played for r in records.values()):
            continue  # group has no data yet
        ranked = rank_group(records)
        print(f"\n=== {gname} ===")
        print(f"{'Rank':<5} {'Team':<14} {'W-L':<5} {'Rub W-L':<8} {'NetRub':<7} "
              f"{'PtsF':<5} {'PtsA':<5} {'NetPts':<7} {'Tiebreak':<10}")
        print("-" * 80)
        for rank, rec, note in ranked:
            losses = rec.ties_played - rec.ties_won
            marker = " ↑" if rank <= 2 and rec.ties_played > 0 else ""
            print(f"{rank:<5} {rec.team_name:<14} {rec.ties_won}-{losses}  "
                  f"  {rec.rubbers_won:>2}-{rec.rubbers_lost:<2}    {rec.net_rubbers:+4d}    "
                  f"{rec.points_for:<5} {rec.points_against:<5} {rec.net_points:+5d}    "
                  f"{note}{marker}")
        print("    ↑ = advances to knockout")


# ----------------------------------------------------------------------
# Section: Tie summary
# ----------------------------------------------------------------------

def print_ties(conn: sqlite3.Connection, tournament_id: int, focus_team: int | None) -> None:
    rows = conn.execute(
        """SELECT tr.tie_id, tr.stage, g.name AS group_name,
                  ta.name AS team_a, tb.name AS team_b,
                  tr.a_rubbers_won, tr.b_rubbers_won, tr.a_points, tr.b_points,
                  tw.name AS winner
           FROM tie_results tr
           JOIN teams ta ON ta.id = tr.team_a_id
           JOIN teams tb ON tb.id = tr.team_b_id
           JOIN teams tw ON tw.id = tr.winner_team_id
           LEFT JOIN groups g ON g.id = tr.group_id
           WHERE tr.tournament_id = ?
           ORDER BY tr.tie_id""",
        (tournament_id,),
    ).fetchall()

    if focus_team is not None:
        rows = [r for r in rows if r["team_a"] == focus_team or r["team_b"] == focus_team]

    print(f"\n=== Tie Summary ({len(rows)} ties)" + (f" — focus: {focus_team}" if focus_team else "") + " ===")
    print(f"{'Stage':<10} {'Group':<16} {'Matchup':<30} {'Score':<8} {'Pts':<10}")
    print("-" * 85)
    for r in rows:
        matchup = f"{r['team_a']} vs {r['team_b']}"
        score = f"{r['a_rubbers_won']}-{r['b_rubbers_won']}"
        pts = f"{r['a_points']}-{r['b_points']}"
        winner_marker = f"→ {r['winner']}"
        print(f"{r['stage']:<10} {r['group_name'] or '-':<16} {matchup:<30} {score:<8} {pts:<10} {winner_marker}")


# ----------------------------------------------------------------------
# Section: Pair-level stats
# ----------------------------------------------------------------------

@dataclass
class PairStat:
    discipline: str
    pid1: int
    pid2: int
    games_played: int = 0
    games_won: int = 0
    points_for: int = 0
    points_against: int = 0
    deployments: list[tuple[int, int, int]] = field(default_factory=list)
    # deployments: list of (tie_id, our_score, opp_score)


def collect_pair_stats(
    conn: sqlite3.Connection, tournament_id: int, team_id: int
) -> dict[tuple[str, tuple[int, int]], PairStat]:
    """Aggregate every pair this team deployed in any rubber."""
    stats: dict[tuple[str, tuple[int, int]], PairStat] = {}
    rows = conn.execute(
        """SELECT r.tie_id, r.discipline,
                  r.a_player1_id, r.a_player2_id, r.a_score,
                  r.b_player1_id, r.b_player2_id, r.b_score,
                  t.team_a_id, t.team_b_id
           FROM rubbers r
           JOIN ties t ON t.id = r.tie_id
           WHERE t.tournament_id = ? AND (t.team_a_id = ? OR t.team_b_id = ?)""",
        (tournament_id, team_id, team_id),
    ).fetchall()

    for r in rows:
        if r["team_a_id"] == team_id:
            our_p1, our_p2 = r["a_player1_id"], r["a_player2_id"]
            our_score, opp_score = r["a_score"], r["b_score"]
        else:
            our_p1, our_p2 = r["b_player1_id"], r["b_player2_id"]
            our_score, opp_score = r["b_score"], r["a_score"]

        key = (r["discipline"], pair_key(our_p1, our_p2))
        if key not in stats:
            stats[key] = PairStat(discipline=r["discipline"], pid1=key[1][0], pid2=key[1][1])
        s = stats[key]
        s.games_played += 1
        s.points_for += our_score
        s.points_against += opp_score
        if our_score > opp_score:
            s.games_won += 1
        s.deployments.append((r["tie_id"], our_score, opp_score))

    return stats


def all_possible_pairs(conn: sqlite3.Connection, team_id: int) -> dict[str, list[tuple[int, int]]]:
    """Return all theoretically-possible MD/WD/XD pairings given the team roster."""
    rows = conn.execute(
        """SELECT p.id, p.gender
           FROM players p
           JOIN team_rosters tr ON tr.player_id = p.id
           WHERE tr.team_id = ?""",
        (team_id,),
    ).fetchall()
    men = sorted([r["id"] for r in rows if r["gender"] == "M"])
    women = sorted([r["id"] for r in rows if r["gender"] == "F"])
    return {
        "MD": list(itertools.combinations(men, 2)),
        "WD": list(itertools.combinations(women, 2)),
        "XD": list(itertools.product(men, women)),
    }


def print_pair_stats(conn: sqlite3.Connection, tournament_id: int, team_id: int) -> None:
    tname = team_name(conn, team_id)
    stats = collect_pair_stats(conn, tournament_id, team_id)

    print(f"\n=== Pair-level deployments for {tname} ===")
    by_discipline: dict[str, list[PairStat]] = defaultdict(list)
    for s in stats.values():
        by_discipline[s.discipline].append(s)

    for discipline in ("MD", "XD", "WD"):
        plist = sorted(by_discipline.get(discipline, []), key=lambda s: -s.games_played)
        print(f"\n  [{discipline}]")
        if not plist:
            print("    (no deployments)")
            continue
        print(f"    {'Pair':<28} {'Games':<6} {'W-L':<5} {'PtsF':<5} {'PtsA':<5} {'NetPts':<7} {'AvgFor':<7} {'AvgAgnst':<8}")
        for s in plist:
            label = pair_names(conn, s.pid1, s.pid2)
            losses = s.games_played - s.games_won
            net = s.points_for - s.points_against
            avg_for = s.points_for / s.games_played
            avg_against = s.points_against / s.games_played
            print(f"    {label:<28} {s.games_played:<6} {s.games_won}-{losses}   "
                  f"{s.points_for:<5} {s.points_against:<5} {net:+5d}   "
                  f"{avg_for:5.1f}   {avg_against:5.1f}")


def print_unused_pairs(conn: sqlite3.Connection, tournament_id: int, team_id: int) -> None:
    tname = team_name(conn, team_id)
    used = collect_pair_stats(conn, tournament_id, team_id)
    used_keys = {(s.discipline, pair_key(s.pid1, s.pid2)) for s in used.values()}
    possible = all_possible_pairs(conn, team_id)

    print(f"\n=== Pairings NOT deployed by {tname} ===")
    for discipline in ("MD", "XD", "WD"):
        unused = [p for p in possible[discipline] if (discipline, pair_key(*p)) not in used_keys]
        used_count = len([s for s in used.values() if s.discipline == discipline])
        possible_count = len(possible[discipline])
        print(f"\n  [{discipline}] used {used_count}/{possible_count} possible pairings")
        if not unused:
            print("    (all possible pairings were tried)")
        else:
            for p1, p2 in unused:
                print(f"    {pair_names(conn, p1, p2)}")


# ----------------------------------------------------------------------
# Section: Matchups (pair vs pair history)
# ----------------------------------------------------------------------

def print_matchups(conn: sqlite3.Connection, tournament_id: int, team_id: int) -> None:
    tname = team_name(conn, team_id)
    rows = conn.execute(
        """SELECT r.tie_id, r.discipline,
                  r.a_player1_id, r.a_player2_id, r.a_score,
                  r.b_player1_id, r.b_player2_id, r.b_score,
                  t.team_a_id, t.team_b_id, t.stage,
                  ta.name AS team_a_name, tb.name AS team_b_name
           FROM rubbers r
           JOIN ties t ON t.id = r.tie_id
           JOIN teams ta ON ta.id = t.team_a_id
           JOIN teams tb ON tb.id = t.team_b_id
           WHERE t.tournament_id = ? AND (t.team_a_id = ? OR t.team_b_id = ?)
           ORDER BY r.tie_id, CASE r.discipline WHEN 'MD' THEN 1 WHEN 'XD' THEN 2 WHEN 'WD' THEN 3 END""",
        (tournament_id, team_id, team_id),
    ).fetchall()

    print(f"\n=== Pair-vs-pair matchups for {tname} ===")
    print(f"{'vs Opponent':<14} {'Disc':<5} {'Our Pair':<26} {'Opp Pair':<26} {'Score':<8} {'Result':<6}")
    print("-" * 95)
    for r in rows:
        if r["team_a_id"] == team_id:
            our_p1, our_p2, our_s = r["a_player1_id"], r["a_player2_id"], r["a_score"]
            opp_p1, opp_p2, opp_s = r["b_player1_id"], r["b_player2_id"], r["b_score"]
            opp_name = r["team_b_name"]
        else:
            our_p1, our_p2, our_s = r["b_player1_id"], r["b_player2_id"], r["b_score"]
            opp_p1, opp_p2, opp_s = r["a_player1_id"], r["a_player2_id"], r["a_score"]
            opp_name = r["team_a_name"]
        our_pair = pair_names(conn, our_p1, our_p2)
        opp_pair = pair_names(conn, opp_p1, opp_p2)
        result = "W" if our_s > opp_s else "L"
        print(f"{opp_name:<14} {r['discipline']:<5} {our_pair:<26} {opp_pair:<26} "
              f"{our_s}-{opp_s:<5} {result}")


# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--team", help="Focus on one team (e.g. 包玉刚)")
    parser.add_argument(
        "--section",
        choices=["all", "standings", "ties", "pairs", "matchups", "unused"],
        default="all",
    )
    args = parser.parse_args()

    with connect() as conn:
        tournament = get_tournament(conn)
        tournament_id = tournament["id"]
        print(f"Tournament: {tournament['name']}")

        team_id = None
        if args.team:
            row = conn.execute(
                "SELECT id FROM teams WHERE tournament_id = ? AND name = ?",
                (tournament_id, args.team),
            ).fetchone()
            if not row:
                print(f"Team not found: {args.team}", file=sys.stderr)
                return 1
            team_id = row["id"]

        if args.section in ("all", "standings"):
            print_standings(conn, tournament_id)
        if args.section in ("all", "ties"):
            print_ties(conn, tournament_id, args.team)
        if args.section in ("all", "pairs"):
            if team_id is None:
                # Print pairs for every team
                teams = conn.execute(
                    "SELECT id FROM teams WHERE tournament_id = ? ORDER BY name",
                    (tournament_id,),
                ).fetchall()
                for t in teams:
                    print_pair_stats(conn, tournament_id, t["id"])
            else:
                print_pair_stats(conn, tournament_id, team_id)
        if args.section in ("all", "matchups"):
            if team_id is None:
                teams = conn.execute(
                    "SELECT id FROM teams WHERE tournament_id = ? ORDER BY name",
                    (tournament_id,),
                ).fetchall()
                for t in teams:
                    print_matchups(conn, tournament_id, t["id"])
            else:
                print_matchups(conn, tournament_id, team_id)
        if args.section in ("all", "unused"):
            if team_id is None:
                teams = conn.execute(
                    "SELECT id FROM teams WHERE tournament_id = ? ORDER BY name",
                    (tournament_id,),
                ).fetchall()
                for t in teams:
                    print_unused_pairs(conn, tournament_id, t["id"])
            else:
                print_unused_pairs(conn, tournament_id, team_id)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
