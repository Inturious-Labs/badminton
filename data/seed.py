"""Load a tournament seed YAML into the database.

Usage:
    python seed.py seed_2026.yaml [--fresh]

--fresh drops the existing DB file and starts clean. Without it, the script
will fail loudly if the tournament already exists (idempotency via UNIQUE).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

from db import DB_PATH, connect, init_schema


def load_seed(path: Path, *, fresh: bool) -> None:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    init_schema(fresh=fresh)

    with connect() as conn:
        cur = conn.cursor()
        t = data["tournament"]
        start_date = t.get("start_date")
        if start_date is not None:
            start_date = str(start_date)  # YAML may parse as date; we store as ISO text
        cur.execute(
            "INSERT INTO tournaments (name, year, start_date, venue, notes) VALUES (?, ?, ?, ?, ?)",
            (t["name"], t["year"], start_date, t.get("venue"), t.get("notes")),
        )
        tournament_id = cur.lastrowid
        print(f"Tournament inserted: id={tournament_id} name={t['name']}")

        for grp in data["groups"]:
            cur.execute(
                "INSERT INTO groups (tournament_id, name) VALUES (?, ?)",
                (tournament_id, grp["name"]),
            )
            group_id = cur.lastrowid

            for team in grp["teams"]:
                cur.execute(
                    "INSERT INTO teams (tournament_id, name) VALUES (?, ?)",
                    (tournament_id, team["name"]),
                )
                team_id = cur.lastrowid
                cur.execute(
                    "INSERT INTO group_memberships (group_id, team_id) VALUES (?, ?)",
                    (group_id, team_id),
                )

                for player in team["players"]:
                    cur.execute(
                        "INSERT INTO players (primary_name, gender) VALUES (?, ?)",
                        (player["name"], player["gender"]),
                    )
                    player_id = cur.lastrowid
                    cur.execute(
                        "INSERT INTO team_rosters (team_id, player_id) VALUES (?, ?)",
                        (team_id, player_id),
                    )
                    for alias in player.get("aliases", []):
                        cur.execute(
                            "INSERT INTO player_aliases (player_id, alias) VALUES (?, ?)",
                            (player_id, alias),
                        )

        conn.commit()
        team_count = cur.execute(
            "SELECT COUNT(*) FROM teams WHERE tournament_id = ?", (tournament_id,)
        ).fetchone()[0]
        player_count = cur.execute("SELECT COUNT(*) FROM players").fetchone()[0]
        print(f"Loaded {team_count} teams, {player_count} players.")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("seed_path", type=Path)
    parser.add_argument("--fresh", action="store_true", help="Drop existing DB first")
    args = parser.parse_args()
    if not args.seed_path.exists():
        print(f"Seed file not found: {args.seed_path}", file=sys.stderr)
        return 1
    load_seed(args.seed_path, fresh=args.fresh)
    print(f"DB at {DB_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
