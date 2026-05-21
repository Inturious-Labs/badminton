"use client";

import type { TournamentData } from "@/lib/types";
import { getTeam } from "@/lib/helpers";

interface StandingsTableProps {
  data: TournamentData;
  onTeamClick?: (teamId: number) => void;
}

export function StandingsTable({ data, onTeamClick }: StandingsTableProps) {
  const groups = data.groups;

  function handleRowClick(teamId: number) {
    if (onTeamClick) onTeamClick(teamId);
    // Update URL hash so the TeamSpotlight (which listens to hashchange) switches team
    if (typeof window !== "undefined") {
      window.location.hash = `team-spotlight&team=${teamId}`;
    }
    // Smooth-scroll to the team spotlight section
    const el = document.getElementById("team-spotlight");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {groups.map((group) => {
        const standings = data.standings
          .filter((s) => s.group_id === group.id)
          .sort((a, b) => a.rank - b.rank);
        const bandClass = group.id === groups[0].id ? "bg-amber-50" : "bg-sky-50";
        const badgeClass = group.id === groups[0].id ? "text-amber-700" : "text-sky-700";
        return (
          <div
            key={group.id}
            className={`rounded-lg border border-zinc-200 overflow-hidden ${bandClass}`}
          >
            <div className="px-4 py-2 border-b border-zinc-200 bg-white/50">
              <h3 className={`text-sm font-semibold ${badgeClass}`}>
                {group.name}
              </h3>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">#</th>
                  <th className="text-left px-3 py-2 font-medium">Team</th>
                  <th className="text-right px-2 py-2 font-medium">W-L</th>
                  <th className="text-right px-2 py-2 font-medium">Rub</th>
                  <th className="text-right px-2 py-2 font-medium">Net</th>
                  <th className="text-right px-3 py-2 font-medium">Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s) => {
                  const team = getTeam(data, s.team_id);
                  const netPts = s.points_for - s.points_against;
                  return (
                    <tr
                      key={s.team_id}
                      onClick={() => handleRowClick(s.team_id)}
                      className="cursor-pointer hover:bg-white/70 transition-colors border-t border-zinc-100"
                    >
                      <td className="px-3 py-2 text-zinc-500">
                        {s.rank}
                        {s.advances && (
                          <span className="ml-1" title="Advanced to knockout">
                            🚀
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium text-zinc-900">{team.name}</td>
                      <td className="px-2 py-2 text-right text-zinc-700">
                        {s.ties_won}-{s.ties_lost}
                      </td>
                      <td className="px-2 py-2 text-right text-zinc-700">
                        {s.rubbers_won}-{s.rubbers_lost}
                      </td>
                      <td
                        className={`px-2 py-2 text-right font-medium ${
                          netPts > 0
                            ? "text-emerald-700"
                            : netPts < 0
                              ? "text-red-700"
                              : "text-zinc-500"
                        }`}
                      >
                        {netPts >= 0 ? `+${netPts}` : netPts}
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-700">
                        {s.points_for}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
