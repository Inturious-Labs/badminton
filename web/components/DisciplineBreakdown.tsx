import type { TournamentData, Discipline } from "@/lib/types";
import { getDisciplineRecords } from "@/lib/helpers";

interface DisciplineBreakdownProps {
  data: TournamentData;
}

// Distinct hues per discipline. Wins = saturated, losses = faded version of the same hue.
const COLORS: Record<Discipline, { win: string; loss: string }> = {
  MD: { win: "#1D4ED8", loss: "#BFDBFE" }, // blue
  XD: { win: "#059669", loss: "#A7F3D0" }, // emerald
  WD: { win: "#DB2777", loss: "#FBCFE8" }, // pink
};

const DISCIPLINES: Discipline[] = ["MD", "XD", "WD"];

export function DisciplineBreakdown({ data }: DisciplineBreakdownProps) {
  const records = getDisciplineRecords(data);
  const n = records.length;
  const gamesPerDiscipline = 5;

  // Vertical layout: teams on Y-axis, bars extending L/R from center axis
  const width = 720;
  const padding = { top: 60, right: 24, bottom: 16, left: 100 };
  // Each team takes a row containing 3 stacked horizontal bars
  const teamRowHeight = 56; // ~3 bars * 14px + 14px gap
  const innerHeight = n * teamRowHeight;
  const height = padding.top + innerHeight + padding.bottom;

  const innerWidth = width - padding.left - padding.right;
  const centerX = padding.left + innerWidth / 2;

  // X-scale: wins go LEFT (negative on the visual axis), losses go RIGHT.
  // We invert sign so a "+wins" value maps to the left half of the chart.
  const xScale = (v: number) => centerX - (v / gamesPerDiscipline) * (innerWidth / 2);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        role="img"
        aria-label="Group-stage discipline breakdown: wins and losses per team in MD, XD, WD"
      >
        {/* Vertical gridlines at -5, -3, 0, +3, +5 */}
        {[-5, -3, 0, 3, 5].map((v) => (
          <g key={`grid-${v}`}>
            <line
              x1={xScale(v)}
              y1={padding.top}
              x2={xScale(v)}
              y2={padding.top + innerHeight}
              className={v === 0 ? "stroke-zinc-300" : "stroke-zinc-100"}
              strokeWidth={1}
            />
            <text
              x={xScale(v)}
              y={padding.top - 8}
              textAnchor="middle"
              className="fill-zinc-400 text-[10px]"
            >
              {v > 0 ? `+${v}` : v}
            </text>
          </g>
        ))}

        {/* "Wins" (left) / "Losses" (right) axis labels above the gridline numbers */}
        <text
          x={xScale(3.5)}
          y={padding.top - 20}
          textAnchor="middle"
          className="fill-emerald-700 text-[10px] font-semibold tracking-wider uppercase"
        >
          ← Wins
        </text>
        <text
          x={xScale(-3.5)}
          y={padding.top - 20}
          textAnchor="middle"
          className="fill-red-700 text-[10px] font-semibold tracking-wider uppercase"
        >
          Losses →
        </text>

        {/* Discipline color legend (also doubles as the only label — per-row labels removed) */}
        <g transform={`translate(${centerX}, ${padding.top - 36})`}>
          {DISCIPLINES.map((d, i) => {
            const labels = { MD: "MD · Men's", XD: "XD · Mixed", WD: "WD · Women's" };
            const spacing = 90;
            const offset = (i - (DISCIPLINES.length - 1) / 2) * spacing;
            return (
              <g key={`legend-top-${d}`} transform={`translate(${offset}, 0)`}>
                <rect x={-32} y={-7} width={10} height={10} fill={COLORS[d].win} rx={1.5} />
                <text
                  x={-18}
                  y={2}
                  className="fill-zinc-700 text-[10px] font-medium"
                >
                  {labels[d]}
                </text>
              </g>
            );
          })}
        </g>

        {/* Bars per team per discipline */}
        {records.map((rec, teamIdx) => {
          const rowTop = padding.top + teamIdx * teamRowHeight;
          const barHeight = 12;
          const barGap = 2;
          const barsBlockHeight = DISCIPLINES.length * barHeight + (DISCIPLINES.length - 1) * barGap;
          const barsStart = rowTop + (teamRowHeight - barsBlockHeight) / 2;

          return (
            <g key={`team-${rec.team_id}`}>
              {/* Team name (left) and total record (right edge) */}
              <text
                x={padding.left - 10}
                y={rowTop + teamRowHeight / 2 - 2}
                textAnchor="end"
                className="fill-zinc-700 text-[12px] font-semibold"
              >
                {rec.team_name}
              </text>
              <text
                x={padding.left - 10}
                y={rowTop + teamRowHeight / 2 + 11}
                textAnchor="end"
                className="fill-zinc-400 text-[10px]"
              >
                {rec.total_wins}-{15 - rec.total_wins}
              </text>

              {/* 3 horizontal bars stacked vertically within the row */}
              {DISCIPLINES.map((d, dIdx) => {
                const wins = rec.per_discipline[d].wins;
                const losses = rec.per_discipline[d].losses;
                const barY = barsStart + dIdx * (barHeight + barGap);

                // With wins-on-left (inverted xScale), xScale(+wins) is to the LEFT of centerX.
                const winBarLeft = xScale(wins);
                const winBarWidth = centerX - winBarLeft;

                const lossBarLeft = centerX;
                const lossBarRight = xScale(-losses);
                const lossBarWidth = lossBarRight - lossBarLeft;

                return (
                  <g key={`team-${rec.team_id}-${d}`}>
                    {wins > 0 && (
                      <rect
                        x={winBarLeft}
                        y={barY}
                        width={winBarWidth}
                        height={barHeight}
                        fill={COLORS[d].win}
                        rx={1.5}
                      />
                    )}
                    {losses > 0 && (
                      <rect
                        x={lossBarLeft}
                        y={barY}
                        width={lossBarWidth}
                        height={barHeight}
                        fill={COLORS[d].loss}
                        rx={1.5}
                      />
                    )}
                    {/* Win count inside the bar (if there's room), left-aligned since bar grows left */}
                    {wins >= 2 && (
                      <text
                        x={winBarLeft + 4}
                        y={barY + barHeight - 2.5}
                        textAnchor="start"
                        className="fill-white text-[9px] font-semibold"
                      >
                        {wins}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

      </svg>
    </div>
  );
}
