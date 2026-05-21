"""SQLite connection helpers and schema initialization."""
from __future__ import annotations

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "tournament.db"
SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def connect(db_path: Path = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_schema(db_path: Path = DB_PATH, *, fresh: bool = False) -> None:
    if fresh and db_path.exists():
        db_path.unlink()
    schema = SCHEMA_PATH.read_text(encoding="utf-8")
    with connect(db_path) as conn:
        conn.executescript(schema)


def player_lookup(conn: sqlite3.Connection, tournament_id: int, team_name: str) -> dict[str, int]:
    """Return {alias_or_primary_name: player_id} for all players on a given team."""
    rows = conn.execute(
        """
        SELECT p.id, p.primary_name
        FROM players p
        JOIN team_rosters tr ON tr.player_id = p.id
        JOIN teams t ON t.id = tr.team_id
        WHERE t.tournament_id = ? AND t.name = ?
        """,
        (tournament_id, team_name),
    ).fetchall()
    lookup: dict[str, int] = {r["primary_name"]: r["id"] for r in rows}
    if not rows:
        return lookup
    player_ids = [r["id"] for r in rows]
    placeholders = ",".join("?" * len(player_ids))
    alias_rows = conn.execute(
        f"SELECT player_id, alias FROM player_aliases WHERE player_id IN ({placeholders})",
        player_ids,
    ).fetchall()
    for ar in alias_rows:
        lookup[ar["alias"]] = ar["player_id"]
    return lookup
