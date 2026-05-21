-- Badminton team tournament schema
-- Designed for the 上海国际及双语学校家长羽毛球春季赛 format and similar:
--   - 12 teams in 2 groups of 6, round-robin
--   - Top 2 per group advance to knockout (semifinals)
--   - Each tie = 3 rubbers (MD/XD/WD), single game to 21
--   - 6 players per team (3 men + 3 women), no substitutes, no double-dipping

PRAGMA foreign_keys = ON;

CREATE TABLE tournaments (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    year        INTEGER NOT NULL,
    start_date  TEXT,            -- ISO date
    venue       TEXT,
    notes       TEXT
);

CREATE TABLE players (
    id            INTEGER PRIMARY KEY,
    primary_name  TEXT NOT NULL UNIQUE,
    gender        TEXT NOT NULL CHECK (gender IN ('M', 'F'))
);

-- Handles "Joanna Lim" vs "陈郁捷" vs "Chen Yujie" referring to the same person.
CREATE TABLE player_aliases (
    player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    alias      TEXT NOT NULL UNIQUE
);

CREATE TABLE teams (
    id             INTEGER PRIMARY KEY,
    tournament_id  INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    UNIQUE (tournament_id, name)
);

CREATE TABLE team_rosters (
    team_id    INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    PRIMARY KEY (team_id, player_id)
);

CREATE TABLE groups (
    id             INTEGER PRIMARY KEY,
    tournament_id  INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,                -- e.g. "团体赛第1组"
    UNIQUE (tournament_id, name)
);

CREATE TABLE group_memberships (
    group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    team_id    INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, team_id)
);

CREATE TABLE ties (
    id             INTEGER PRIMARY KEY,
    tournament_id  INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    match_number   INTEGER,                      -- 场序 from the schedule
    stage          TEXT NOT NULL CHECK (stage IN ('group', 'semifinal', 'final', 'third_place')),
    group_id       INTEGER REFERENCES groups(id),
    round_number   INTEGER,                      -- group-stage round (1..5)
    team_a_id      INTEGER NOT NULL REFERENCES teams(id),
    team_b_id      INTEGER NOT NULL REFERENCES teams(id),
    CHECK (team_a_id <> team_b_id),
    CHECK (
        (stage = 'group' AND group_id IS NOT NULL) OR
        (stage <> 'group' AND group_id IS NULL)
    )
);

CREATE TABLE rubbers (
    id            INTEGER PRIMARY KEY,
    tie_id        INTEGER NOT NULL REFERENCES ties(id) ON DELETE CASCADE,
    discipline    TEXT NOT NULL CHECK (discipline IN ('MD', 'XD', 'WD')),
    -- Side A players (member team_a of the tie)
    a_player1_id  INTEGER NOT NULL REFERENCES players(id),
    a_player2_id  INTEGER NOT NULL REFERENCES players(id),
    a_score       INTEGER NOT NULL CHECK (a_score BETWEEN 0 AND 21),
    -- Side B players (member team_b of the tie)
    b_player1_id  INTEGER NOT NULL REFERENCES players(id),
    b_player2_id  INTEGER NOT NULL REFERENCES players(id),
    b_score       INTEGER NOT NULL CHECK (b_score BETWEEN 0 AND 21),
    -- Exactly one side reached 21 (single game to 21, hard cap)
    CHECK (
        (a_score = 21 AND b_score < 21) OR
        (b_score = 21 AND a_score < 21)
    ),
    CHECK (a_player1_id <> a_player2_id),
    CHECK (b_player1_id <> b_player2_id),
    UNIQUE (tie_id, discipline)
);

CREATE INDEX idx_ties_tournament ON ties(tournament_id);
CREATE INDEX idx_ties_teams ON ties(team_a_id, team_b_id);
CREATE INDEX idx_rubbers_tie ON rubbers(tie_id);

-- Derived view: tie winners
CREATE VIEW tie_results AS
SELECT
    t.id AS tie_id,
    t.tournament_id,
    t.stage,
    t.group_id,
    t.round_number,
    t.team_a_id,
    t.team_b_id,
    SUM(CASE WHEN r.a_score > r.b_score THEN 1 ELSE 0 END) AS a_rubbers_won,
    SUM(CASE WHEN r.b_score > r.a_score THEN 1 ELSE 0 END) AS b_rubbers_won,
    SUM(r.a_score) AS a_points,
    SUM(r.b_score) AS b_points,
    CASE
        WHEN SUM(CASE WHEN r.a_score > r.b_score THEN 1 ELSE 0 END) >
             SUM(CASE WHEN r.b_score > r.a_score THEN 1 ELSE 0 END)
        THEN t.team_a_id
        ELSE t.team_b_id
    END AS winner_team_id
FROM ties t
JOIN rubbers r ON r.tie_id = t.id
GROUP BY t.id;
