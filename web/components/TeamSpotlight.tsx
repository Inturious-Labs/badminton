"use client";

import { useEffect, useState } from "react";
import type {
  Discipline,
  PairStat,
  Rubber,
  Tie,
  TournamentData,
  UnusedPair,
} from "@/lib/types";

interface TeamSpotlightProps {
  data: TournamentData;
  defaultTeamId: number;
}

const DISCIPLINES: Discipline[] = ["MD", "XD", "WD"];
const DISCIPLINE_LABELS: Record<Discipline, string> = {
  MD: "MD (男双)",
  XD: "XD (混双)",
  WD: "WD (女双)",
};

export function TeamSpotlight({ data, defaultTeamId }: TeamSpotlightProps) {
  const [teamId, setTeamId] = useState<number>(defaultTeamId);

  // Sync with URL hash on mount and when hash changes
  useEffect(() => {
    function syncFromHash() {
      if (typeof window === "undefined") return;
      const match = window.location.hash.match(/team=(\d+)/);
      if (match) {
        const id = Number(match[1]);
        if (data.teams.some((t) => t.id === id)) setTeamId(id);
      }
    }
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [data.teams]);

  function handleTeamChange(newId: number) {
    setTeamId(newId);
    // Update hash without scrolling
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.hash = `team-spotlight&team=${newId}`;
      window.history.replaceState(null, "", url.toString());
    }
  }

  const team = data.teams.find((t) => t.id === teamId);
  if (!team) return null;
  const standing = data.standings.find((s) => s.team_id === teamId);
  const group = data.groups.find((g) => g.id === team.group_id);
  const teamTies = data.ties.filter(
    (t) => t.team_a_id === teamId || t.team_b_id === teamId,
  );
  const teamPairs = data.pair_stats.filter((p) => p.team_id === teamId);
  const teamUnused = data.unused_pairs.filter((u) => u.team_id === teamId);

  const playersById = new Map(data.players.map((p) => [p.id, p]));
  const teamsById = new Map(data.teams.map((t) => [t.id, t]));

  function playerName(id: number): string {
    return playersById.get(id)?.name ?? `?`;
  }
  function pairName(ids: readonly number[]): string {
    return ids.map(playerName).join(" / ");
  }

  // Sort tie list chronologically by tie id (which matches play order)
  const tiesSorted = [...teamTies].sort((a, b) => a.id - b.id);

  // Build per-discipline pair stats lists, sorted by games played desc, then win rate
  const pairsByDisc: Record<Discipline, PairStat[]> = { MD: [], XD: [], WD: [] };
  for (const p of teamPairs) pairsByDisc[p.discipline].push(p);
  for (const d of DISCIPLINES) {
    pairsByDisc[d].sort((a, b) => {
      if (b.games_played !== a.games_played) return b.games_played - a.games_played;
      return b.games_won / b.games_played - a.games_won / a.games_played;
    });
  }
  const unusedByDisc: Record<Discipline, UnusedPair[]> = { MD: [], XD: [], WD: [] };
  for (const u of teamUnused) unusedByDisc[u.discipline].push(u);

  return (
    <div className="space-y-6">
      {/* Team selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <label htmlFor="team-select" className="text-sm text-zinc-600">
          Team:
        </label>
        <select
          id="team-select"
          value={teamId}
          onChange={(e) => handleTeamChange(Number(e.target.value))}
          className="border border-zinc-300 rounded px-3 py-1.5 text-sm bg-white"
        >
          {data.groups.map((g) => (
            <optgroup key={g.id} label={g.name}>
              {data.teams
                .filter((t) => t.group_id === g.id)
                .sort((a, b) => a.name.localeCompare(b.name, "zh"))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Team header */}
      <div>
        <h3 className="text-2xl font-semibold text-zinc-900">{team.name}</h3>
        {standing && group && (
          <p className="text-sm text-zinc-600 mt-1">
            {group.name} · #{standing.rank}
            {standing.advances && (
              <span className="ml-2 text-emerald-700 font-medium">
                Advanced to knockout
              </span>
            )}{" "}
            · {standing.ties_won}W-{standing.ties_lost}L · Rubbers{" "}
            {standing.rubbers_won}-{standing.rubbers_lost} · Net pts{" "}
            {standing.points_for - standing.points_against >= 0 ? "+" : ""}
            {standing.points_for - standing.points_against}
          </p>
        )}
      </div>

      {/* Roster */}
      <div>
        <h4 className="text-sm font-semibold text-zinc-700 mb-2">Roster</h4>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div>
            <span className="text-zinc-500 text-xs mr-2">Men:</span>
            {team.roster
              .filter((p) => p.gender === "M")
              .map((p) => p.name)
              .join("   ")}
          </div>
          <div>
            <span className="text-zinc-500 text-xs mr-2">Women:</span>
            {team.roster
              .filter((p) => p.gender === "F")
              .map((p) => p.name)
              .join("   ")}
          </div>
        </div>
      </div>

      {/* Ties played */}
      <div>
        <h4 className="text-sm font-semibold text-zinc-700 mb-2">
          Ties Played ({tiesSorted.length})
        </h4>
        <div className="space-y-3">
          {tiesSorted.map((tie) => (
            <TieCard
              key={tie.id}
              tie={tie}
              teamId={teamId}
              teamsById={teamsById}
              playerName={playerName}
            />
          ))}
        </div>
      </div>

      {/* Pair deployments */}
      <div>
        <h4 className="text-sm font-semibold text-zinc-700 mb-3">
          Pair Deployments
        </h4>
        <div className="space-y-4">
          {DISCIPLINES.map((d) => {
            const used = pairsByDisc[d];
            const unused = unusedByDisc[d];
            return (
              <div key={d}>
                <div className="flex items-baseline justify-between mb-1">
                  <h5 className="text-sm font-medium text-zinc-800">
                    {DISCIPLINE_LABELS[d]}
                  </h5>
                  <span className="text-xs text-zinc-500">
                    {used.length} used · {unused.length} not tried
                  </span>
                </div>
                {used.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead className="text-xs text-zinc-500">
                      <tr>
                        <th className="text-left py-1 font-medium">Pair</th>
                        <th className="text-right py-1 font-medium">Games</th>
                        <th className="text-right py-1 font-medium">W-L</th>
                        <th className="text-right py-1 font-medium">Pts For</th>
                        <th className="text-right py-1 font-medium">Pts Against</th>
                        <th className="text-right py-1 font-medium">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {used.map((p, i) => {
                        const net = p.points_for - p.points_against;
                        return (
                          <tr key={i} className="border-t border-zinc-100">
                            <td className="py-1.5 text-zinc-900">{pairName(p.player_ids)}</td>
                            <td className="py-1.5 text-right text-zinc-700">{p.games_played}</td>
                            <td className="py-1.5 text-right text-zinc-700">
                              {p.games_won}-{p.games_played - p.games_won}
                            </td>
                            <td className="py-1.5 text-right text-zinc-700">{p.points_for}</td>
                            <td className="py-1.5 text-right text-zinc-700">
                              {p.points_against}
                            </td>
                            <td
                              className={`py-1.5 text-right font-medium ${
                                net > 0
                                  ? "text-emerald-700"
                                  : net < 0
                                    ? "text-red-700"
                                    : "text-zinc-500"
                              }`}
                            >
                              {net >= 0 ? `+${net}` : net}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-zinc-400 italic">No deployments</p>
                )}
                {unused.length > 0 && (
                  <div className="text-xs text-zinc-400 mt-1">
                    Not tried:{" "}
                    {unused
                      .map((u) => pairName(u.player_ids))
                      .join(" · ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---- Sub-component: Tie card ----

interface TieCardProps {
  tie: Tie;
  teamId: number;
  teamsById: Map<number, { name: string }>;
  playerName: (id: number) => string;
}

function TieCard({ tie, teamId, teamsById, playerName }: TieCardProps) {
  const isTeamA = tie.team_a_id === teamId;
  const ourName = teamsById.get(teamId)?.name ?? "?";
  const oppName = teamsById.get(isTeamA ? tie.team_b_id : tie.team_a_id)?.name ?? "?";
  const ourRubbers = isTeamA ? tie.a_rubbers_won : tie.b_rubbers_won;
  const oppRubbers = isTeamA ? tie.b_rubbers_won : tie.a_rubbers_won;
  const won = tie.winner_team_id === teamId;
  const stageLabel: Record<string, string> = {
    group: "Group",
    semifinal: "Semifinal",
    final: "Final",
    third_place: "3rd-place",
  };

  return (
    <div className="border border-zinc-200 rounded-md overflow-hidden">
      <div
        className={`px-3 py-2 flex items-center justify-between text-sm border-b border-zinc-200 ${
          won ? "bg-emerald-50" : "bg-red-50/40"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
            {stageLabel[tie.stage]}
          </span>
          <span className="text-zinc-900 font-medium">
            {ourName} vs {oppName}
          </span>
        </div>
        <div className="text-sm font-semibold">
          <span className={won ? "text-emerald-700" : "text-red-700"}>
            {ourRubbers}-{oppRubbers}
          </span>
          <span className="text-zinc-400 text-xs ml-1">{won ? "W" : "L"}</span>
        </div>
      </div>
      <table className="w-full text-xs">
        <tbody>
          {tie.rubbers.map((r: Rubber, i: number) => {
            const ourPlayers = isTeamA ? r.a_players : r.b_players;
            const oppPlayers = isTeamA ? r.b_players : r.a_players;
            const ourScore = isTeamA ? r.a_score : r.b_score;
            const oppScore = isTeamA ? r.b_score : r.a_score;
            const ourWon = ourScore > oppScore;
            return (
              <tr key={i} className={i > 0 ? "border-t border-zinc-100" : ""}>
                <td className="py-1.5 px-3 w-12 text-zinc-500 font-medium">
                  {r.discipline}
                </td>
                <td className="py-1.5 text-right text-zinc-700">
                  {ourPlayers.map(playerName).join(" / ")}
                </td>
                <td
                  className={`py-1.5 px-2 w-12 text-center font-semibold ${
                    ourWon ? "text-emerald-700" : "text-zinc-400"
                  }`}
                >
                  {ourScore}
                </td>
                <td className="text-zinc-400 px-1">—</td>
                <td
                  className={`py-1.5 px-2 w-12 text-center font-semibold ${
                    !ourWon ? "text-emerald-700" : "text-zinc-400"
                  }`}
                >
                  {oppScore}
                </td>
                <td className="py-1.5 text-left text-zinc-700 pr-3">
                  {oppPlayers.map(playerName).join(" / ")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
