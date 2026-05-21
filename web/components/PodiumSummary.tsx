import { getFinalRanking, getTeam } from "@/lib/data";
import type { TournamentData } from "@/lib/types";

interface PodiumSummaryProps {
  data: TournamentData;
}

export function PodiumSummary({ data }: PodiumSummaryProps) {
  const { champion, runnerUp, third, fourth } = getFinalRanking(data);
  const rows: { label: string; team_id: number | undefined }[] = [
    { label: "🏆 Champion", team_id: champion },
    { label: "🥈 Runner-up", team_id: runnerUp },
    { label: "🥉 Third Place", team_id: third },
    { label: "🎖️ Fourth Place", team_id: fourth },
  ];

  return (
    <ol className="space-y-1 text-sm sm:text-base text-zinc-800">
      {rows.map((row, idx) => (
        <li key={idx} className="flex items-baseline gap-3">
          <span className="font-semibold w-32 sm:w-36 shrink-0">{row.label}</span>
          <span>{row.team_id ? getTeam(data, row.team_id).name : "—"}</span>
        </li>
      ))}
    </ol>
  );
}
