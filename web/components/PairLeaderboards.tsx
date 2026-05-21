import type { Discipline, PairStat, TournamentData } from "@/lib/types";

interface PairLeaderboardsProps {
  data: TournamentData;
}

const DISCIPLINES: Discipline[] = ["MD", "XD", "WD"];
const DISCIPLINE_LABELS: Record<Discipline, string> = {
  MD: "Men's Doubles (男双)",
  XD: "Mixed Doubles (混双)",
  WD: "Women's Doubles (女双)",
};

function winRate(s: PairStat): number {
  return s.games_played === 0 ? 0 : s.games_won / s.games_played;
}

function netPts(s: PairStat): number {
  return s.points_for - s.points_against;
}

export function PairLeaderboards({ data }: PairLeaderboardsProps) {
  const playersById = new Map(data.players.map((p) => [p.id, p]));
  const teamsById = new Map(data.teams.map((t) => [t.id, t]));
  function playerName(id: number): string {
    return playersById.get(id)?.name ?? "?";
  }

  // Group pair stats by discipline, sort by win rate then net points
  const byDiscipline: Record<Discipline, PairStat[]> = { MD: [], XD: [], WD: [] };
  for (const p of data.pair_stats) byDiscipline[p.discipline].push(p);
  for (const d of DISCIPLINES) {
    byDiscipline[d].sort((a, b) => {
      const wr = winRate(b) - winRate(a);
      if (Math.abs(wr) > 0.0001) return wr;
      return netPts(b) - netPts(a);
    });
  }

  return (
    <div className="space-y-8">
      {DISCIPLINES.map((d) => {
        const pairs = byDiscipline[d];
        return (
          <div key={d}>
            <h3 className="text-base font-semibold text-zinc-900 mb-2">
              {DISCIPLINE_LABELS[d]}
            </h3>
            <p className="text-xs text-zinc-500 mb-2">
              {pairs.length} pairs · sorted by win rate, then net points
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr className="border-b border-zinc-200">
                    <th className="text-left py-1.5 px-2 font-medium">#</th>
                    <th className="text-left py-1.5 px-2 font-medium">Pair</th>
                    <th className="text-left py-1.5 px-2 font-medium">Team</th>
                    <th className="text-right py-1.5 px-2 font-medium">Games</th>
                    <th className="text-right py-1.5 px-2 font-medium">W-L</th>
                    <th className="text-right py-1.5 px-2 font-medium">Win %</th>
                    <th className="text-right py-1.5 px-2 font-medium">Net Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {pairs.map((p, i) => {
                    const team = teamsById.get(p.team_id);
                    const wr = winRate(p);
                    const np = netPts(p);
                    return (
                      <tr key={`${p.team_id}-${i}`} className="border-b border-zinc-100">
                        <td className="py-1.5 px-2 text-zinc-500">{i + 1}</td>
                        <td className="py-1.5 px-2 text-zinc-900 font-medium">
                          {p.player_ids.map(playerName).join(" / ")}
                        </td>
                        <td className="py-1.5 px-2 text-zinc-600">{team?.name ?? "?"}</td>
                        <td className="py-1.5 px-2 text-right text-zinc-700">
                          {p.games_played}
                        </td>
                        <td className="py-1.5 px-2 text-right text-zinc-700">
                          {p.games_won}-{p.games_played - p.games_won}
                        </td>
                        <td className="py-1.5 px-2 text-right text-zinc-700">
                          {(wr * 100).toFixed(0)}%
                        </td>
                        <td
                          className={`py-1.5 px-2 text-right font-medium ${
                            np > 0
                              ? "text-emerald-700"
                              : np < 0
                                ? "text-red-700"
                                : "text-zinc-500"
                          }`}
                        >
                          {np >= 0 ? `+${np}` : np}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
