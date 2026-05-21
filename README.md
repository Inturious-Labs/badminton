# 2026 上海国际及双语学校家长羽毛球春季赛 — Team Tournament Analysis

A descriptive analytics site for the 2026 Shanghai International & Bilingual Schools Parents' Badminton Spring League (团体赛 — team competition only).

Live: <https://badminton.inturious.com>

## What's in this repo

```
.
├── data/         # Python data pipeline: SQLite schema, ingestion, analysis, JSON export
├── web/          # Next.js 16 static site that consumes tournament.json
└── 2026年国际双语学校-秩序册5.19.pdf   # Official rulebook (source of truth for format & tiebreakers)
```

### `data/` — Python pipeline

1. `python seed.py seed_2026.yaml --fresh` — seed teams, players, groups into SQLite
2. `python ingest.py ties_2026.yaml --replace` — ingest tie/rubber data with validation
3. `python analyze.py` — print descriptive analytics
4. `python export_json.py` — produce `tournament.json` for the web app

Source data: WeChat mini-program screenshots in `data/src/`, manually transcribed into `data/ties_2026.yaml`.

### `web/` — Next.js 16 app

Single-page tournament microsite:
- Hero: tournament title, podium summary, journey-to-podium chart
- Standings: per-group tables with rulebook tiebreakers
- Team Spotlight: interactive dropdown, full roster + ties + pair deployments
- Pair Leaderboards: tournament-wide pair rankings per discipline

```
cd web
pnpm install
pnpm dev    # http://localhost:3000
pnpm build  # production build
```

`web/public/tournament.json` is the static data file. It's committed directly (regenerated from `data/` whenever the Python pipeline runs).

## Deployment

Hosted on Vercel from this GitHub repo. The Vercel project's root directory is `web/`. Pushing to `main` triggers a redeploy.
