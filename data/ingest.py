"""Ingest tie/rubber data from a YAML file into the database.

Usage:
    python ingest.py ties_2026.yaml [--replace]

--replace drops all existing ties for the tournament before loading.
Without it, the script appends and will fail loudly on duplicate (UNIQUE).

Validations performed (script aborts if any fail):
  * Both teams exist in the tournament and are in the named group (group ties).
  * All players are on the roster of the team they are assigned to.
  * Gender composition: MD = 2M+2M, WD = 2F+2F, XD = 1M1F vs 1M1F.
  * Each rubber's two players on a side are distinct.
  * Score is single-game-to-21 with hard cap (exactly one side at 21).
  * Group ties have exactly 3 rubbers (rule: 打满全部项目).
  * Knockout ties have 2 or 3 rubbers; if 2, the winning side must lead 2-0.
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

import yaml

from db import DB_PATH, connect, player_lookup


class IngestError(Exception):
    pass


def fetch_tournament_id(conn, name: str) -> int:
    row = conn.execute(
        "SELECT id FROM tournaments WHERE name = ?", (name,)
    ).fetchone()
    if not row:
        raise IngestError(f"Tournament not found: {name!r}. Did you run seed.py?")
    return row["id"]


def fetch_team_id(conn, tournament_id: int, name: str) -> int:
    row = conn.execute(
        "SELECT id FROM teams WHERE tournament_id = ? AND name = ?",
        (tournament_id, name),
    ).fetchone()
    if not row:
        raise IngestError(f"Team not found in tournament: {name!r}")
    return row["id"]


def fetch_group_id(conn, tournament_id: int, name: str) -> int:
    row = conn.execute(
        "SELECT id FROM groups WHERE tournament_id = ? AND name = ?",
        (tournament_id, name),
    ).fetchone()
    if not row:
        raise IngestError(f"Group not found in tournament: {name!r}")
    return row["id"]


def fetch_team_in_group(conn, group_id: int, team_id: int) -> bool:
    row = conn.execute(
        "SELECT 1 FROM group_memberships WHERE group_id = ? AND team_id = ?",
        (group_id, team_id),
    ).fetchone()
    return row is not None


def resolve_player(name_to_id: dict[str, int], team_name: str, name: str) -> int:
    if name not in name_to_id:
        raise IngestError(
            f"Player {name!r} is not on team {team_name!r}. "
            f"Either the name was misspelled or the player belongs to a different team."
        )
    return name_to_id[name]


def player_gender(conn, player_id: int) -> str:
    return conn.execute(
        "SELECT gender FROM players WHERE id = ?", (player_id,)
    ).fetchone()["gender"]


def validate_rubber_gender(conn, discipline: str, a_ids: list[int], b_ids: list[int]) -> None:
    genders_a = [player_gender(conn, pid) for pid in a_ids]
    genders_b = [player_gender(conn, pid) for pid in b_ids]
    composition_a = Counter(genders_a)
    composition_b = Counter(genders_b)

    if discipline == "MD":
        expected = Counter({"M": 2})
    elif discipline == "WD":
        expected = Counter({"F": 2})
    elif discipline == "XD":
        expected = Counter({"M": 1, "F": 1})
    else:
        raise IngestError(f"Unknown discipline: {discipline}")

    if composition_a != expected:
        raise IngestError(
            f"{discipline} side A has wrong gender composition: "
            f"got {dict(composition_a)}, expected {dict(expected)}"
        )
    if composition_b != expected:
        raise IngestError(
            f"{discipline} side B has wrong gender composition: "
            f"got {dict(composition_b)}, expected {dict(expected)}"
        )


def validate_tie_rubber_counts(stage: str, n_rubbers: int, a_won: int, b_won: int) -> None:
    if stage == "group":
        if n_rubbers != 3:
            raise IngestError(
                f"Group ties must have exactly 3 rubbers (rule: 打满全部项目), got {n_rubbers}"
            )
    else:  # knockout (semifinal, final, third_place)
        if n_rubbers not in (2, 3):
            raise IngestError(f"Knockout ties must have 2 or 3 rubbers, got {n_rubbers}")
        if n_rubbers == 2:
            if max(a_won, b_won) != 2 or min(a_won, b_won) != 0:
                raise IngestError(
                    f"Knockout tie with 2 rubbers must be 2-0 (rule: 不再进行第三场比赛), "
                    f"got {a_won}-{b_won}"
                )


def ingest_ties(yaml_path: Path, *, replace: bool) -> None:
    data = yaml.safe_load(yaml_path.read_text(encoding="utf-8"))
    tournament_name = data["tournament"]

    with connect() as conn:
        tournament_id = fetch_tournament_id(conn, tournament_name)

        if replace:
            conn.execute("DELETE FROM ties WHERE tournament_id = ?", (tournament_id,))
            print(f"Cleared existing ties for tournament_id={tournament_id}")

        cur = conn.cursor()
        loaded = 0
        skipped = 0

        for idx, tie in enumerate(data.get("ties") or [], start=1):
            stage = tie["stage"]
            team_a_name = tie["team_a"]
            team_b_name = tie["team_b"]

            try:
                team_a_id = fetch_team_id(conn, tournament_id, team_a_name)
                team_b_id = fetch_team_id(conn, tournament_id, team_b_name)
                group_id = None
                if stage == "group":
                    group_id = fetch_group_id(conn, tournament_id, tie["group"])
                    for tid, tname in [(team_a_id, team_a_name), (team_b_id, team_b_name)]:
                        if not fetch_team_in_group(conn, group_id, tid):
                            raise IngestError(
                                f"Team {tname!r} is not a member of group {tie['group']!r}"
                            )

                a_lookup = player_lookup(conn, tournament_id, team_a_name)
                b_lookup = player_lookup(conn, tournament_id, team_b_name)

                # Pre-validate every rubber before inserting anything
                resolved_rubbers = []
                a_rubbers_won = b_rubbers_won = 0
                for rubber in tie["rubbers"]:
                    discipline = rubber["discipline"]
                    a_names = rubber["a"]
                    b_names = rubber["b"]
                    a_score = int(rubber["a_score"])
                    b_score = int(rubber["b_score"])

                    if len(a_names) != 2 or len(b_names) != 2:
                        raise IngestError(f"Rubber {discipline} needs exactly 2 players per side")

                    a_ids = [resolve_player(a_lookup, team_a_name, n) for n in a_names]
                    b_ids = [resolve_player(b_lookup, team_b_name, n) for n in b_names]
                    if a_ids[0] == a_ids[1]:
                        raise IngestError(f"{discipline} side A: same player listed twice")
                    if b_ids[0] == b_ids[1]:
                        raise IngestError(f"{discipline} side B: same player listed twice")

                    validate_rubber_gender(conn, discipline, a_ids, b_ids)

                    if (a_score == 21) == (b_score == 21):
                        raise IngestError(
                            f"{discipline} score {a_score}-{b_score}: exactly one side must reach 21"
                        )

                    if a_score > b_score:
                        a_rubbers_won += 1
                    else:
                        b_rubbers_won += 1

                    resolved_rubbers.append((discipline, a_ids, a_score, b_ids, b_score))

                validate_tie_rubber_counts(stage, len(resolved_rubbers), a_rubbers_won, b_rubbers_won)

                cur.execute(
                    """INSERT INTO ties
                       (tournament_id, match_number, stage, group_id, round_number, team_a_id, team_b_id)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        tournament_id,
                        tie.get("match_number"),
                        stage,
                        group_id,
                        tie.get("round_number"),
                        team_a_id,
                        team_b_id,
                    ),
                )
                tie_id = cur.lastrowid

                for discipline, a_ids, a_score, b_ids, b_score in resolved_rubbers:
                    cur.execute(
                        """INSERT INTO rubbers
                           (tie_id, discipline,
                            a_player1_id, a_player2_id, a_score,
                            b_player1_id, b_player2_id, b_score)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                        (tie_id, discipline, a_ids[0], a_ids[1], a_score, b_ids[0], b_ids[1], b_score),
                    )

                loaded += 1
                winner_name = team_a_name if a_rubbers_won > b_rubbers_won else team_b_name
                print(f"  #{idx:2d} [{stage:9s}] {team_a_name} vs {team_b_name} "
                      f"→ {winner_name} wins {max(a_rubbers_won, b_rubbers_won)}-{min(a_rubbers_won, b_rubbers_won)}")
            except IngestError as e:
                skipped += 1
                print(f"  #{idx:2d} SKIPPED ({team_a_name} vs {team_b_name}): {e}", file=sys.stderr)
                conn.rollback()
                continue

        conn.commit()
        print(f"\nLoaded {loaded} ties, skipped {skipped}.")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("yaml_path", type=Path)
    parser.add_argument("--replace", action="store_true",
                        help="Delete existing ties for the tournament first")
    args = parser.parse_args()
    if not args.yaml_path.exists():
        print(f"YAML file not found: {args.yaml_path}", file=sys.stderr)
        return 1
    try:
        ingest_ties(args.yaml_path, replace=args.replace)
    except IngestError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    print(f"DB at {DB_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
