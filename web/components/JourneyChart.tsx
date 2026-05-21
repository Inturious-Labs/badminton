import type { Standing, TournamentData } from "@/lib/types";
import { getFinalRanking, getKnockoutTies, getTeam } from "@/lib/data";

type Pt = { x: number; y: number };

interface TeamJourney {
  team_id: number;
  team_name: string;
  group_id: number;
  group_rank: number;
  group_record: string;
  final_rank: number;
  is_top4: boolean;
  reached_sf: boolean;
  reached_final: boolean;
  ys: {
    group: number;
    sf: number | null;
    final: number | null;
  };
  color: string;
}

// Top-4 colors picked for legibility against each team's group-background tint,
// not for rank. Champion/finalist info is conveyed by the podium summary and
// final-column brackets — color here is just for "which line is whose."
const COLORS = {
  group1Primary: "#059669", // emerald-600 — high contrast on amber-50
  group1Secondary: "#7C3AED", // violet-600 — distinct on amber
  group2Primary: "#DC2626", // red-600 — high contrast on sky-50
  group2Secondary: "#1E3A8A", // blue-900 navy — distinct from red on sky
  ghost: "#94A3B8", // slate-400
};

function buildJourneys(data: TournamentData): TeamJourney[] {
  const { champion, runnerUp, third, fourth } = getFinalRanking(data);
  const finalRankMap = new Map<number, number>();
  if (champion) finalRankMap.set(champion, 1);
  if (runnerUp) finalRankMap.set(runnerUp, 2);
  if (third) finalRankMap.set(third, 3);
  if (fourth) finalRankMap.set(fourth, 4);

  const { semifinals } = getKnockoutTies(data);
  const sfTeamIds = new Set<number>();
  semifinals.forEach((t) => {
    sfTeamIds.add(t.team_a_id);
    sfTeamIds.add(t.team_b_id);
  });

  // Color assignment for top-4: by group + finalist status.
  // The finalist (rank 1 or 2) from each group gets the group's "primary" color;
  // the SF-loser from that group gets the "secondary" color.
  const sortedGroupIds = [...data.groups.map((g) => g.id)].sort((a, b) => a - b);
  const groupPalette = (groupId: number, isFinalist: boolean): string => {
    const idx = sortedGroupIds.indexOf(groupId);
    if (idx === 0) return isFinalist ? COLORS.group1Primary : COLORS.group1Secondary;
    return isFinalist ? COLORS.group2Primary : COLORS.group2Secondary;
  };

  return data.standings.map((s: Standing) => {
    const team = getTeam(data, s.team_id);
    const fr = finalRankMap.get(s.team_id) ?? 8;
    const isTop4 = fr <= 4;
    const isFinalist = fr === 1 || fr === 2;
    return {
      team_id: s.team_id,
      team_name: team.name,
      group_id: s.group_id,
      group_rank: s.rank,
      group_record: `${s.ties_won}-${s.ties_lost}`,
      final_rank: fr,
      is_top4: isTop4,
      reached_sf: sfTeamIds.has(s.team_id),
      reached_final: isFinalist,
      ys: { group: 0, sf: null, final: null },
      color: isTop4 ? groupPalette(s.group_id, isFinalist) : COLORS.ghost,
    };
  });
}

// Y-coordinate scheme (12 lanes, no gap):
//   * Group 1 occupies lanes 0-5 (will be tinted via a background band)
//   * Group 2 occupies lanes 6-11
//   * SF column: 4 dots at lanes 3.5, 4.5, 6.5, 7.5 — paired so each SF matchup is adjacent
//     and the chart midline (5.5) separates SF1 from SF2
//   * Final column: 2 dots at lanes 4.5 and 5.5 — finalists adjacent at the midline
function assignYCoordinates(
  journeys: TeamJourney[],
  groupIds: number[],
  data: TournamentData,
): void {
  const sortedGroups = [...groupIds].sort((a, b) => a - b);
  const teamsPerGroup = 6;
  for (const j of journeys) {
    const groupIdx = sortedGroups.indexOf(j.group_id);
    j.ys.group = groupIdx * teamsPerGroup + (j.group_rank - 1);
  }

  const { semifinals, final } = getKnockoutTies(data);
  if (semifinals.length >= 2) {
    const [sf1, sf2] = semifinals;
    const sf1Winner = sf1.winner_team_id;
    const sf1Loser = sf1.winner_team_id === sf1.team_a_id ? sf1.team_b_id : sf1.team_a_id;
    const sf2Winner = sf2.winner_team_id;
    const sf2Loser = sf2.winner_team_id === sf2.team_a_id ? sf2.team_b_id : sf2.team_a_id;

    // SF column: SF1 (winner+loser) clustered above midline, SF2 below
    const sfAssignments: Record<number, number> = {
      [sf1Winner]: 3.5,
      [sf1Loser]: 4.5,
      [sf2Loser]: 6.5,
      [sf2Winner]: 7.5,
    };
    for (const j of journeys) {
      if (sfAssignments[j.team_id] !== undefined) {
        j.ys.sf = sfAssignments[j.team_id];
      }
    }
  }

  if (final) {
    const finalWinner = final.winner_team_id;
    const finalLoser = final.winner_team_id === final.team_a_id ? final.team_b_id : final.team_a_id;
    for (const j of journeys) {
      if (j.team_id === finalWinner) j.ys.final = 4.5;
      else if (j.team_id === finalLoser) j.ys.final = 5.5;
    }
  }
}

interface JourneyChartProps {
  data: TournamentData;
}

export function JourneyChart({ data }: JourneyChartProps) {
  const journeys = buildJourneys(data);
  assignYCoordinates(
    journeys,
    data.groups.map((g) => g.id),
    data,
  );

  const { semifinals, final } = getKnockoutTies(data);

  const width = 680;
  const height = 540;
  const padding = { top: 64, right: 60, bottom: 30, left: 110 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const totalLanes = 12;
  const laneHeight = innerHeight / totalLanes;
  const yForLane = (lane: number) => padding.top + lane * laneHeight + laneHeight / 2;

  const stageX = {
    group: padding.left,
    sf: padding.left + innerWidth * 0.5,
    final: padding.left + innerWidth,
  };

  function buildPath(j: TeamJourney): string {
    const pts: Pt[] = [{ x: stageX.group, y: yForLane(j.ys.group) }];
    if (j.ys.sf !== null) pts.push({ x: stageX.sf, y: yForLane(j.ys.sf) });
    if (j.ys.final !== null) pts.push({ x: stageX.final, y: yForLane(j.ys.final) });
    if (pts.length === 1) return "";
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const midX = (p0.x + p1.x) / 2;
      d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    return d;
  }

  const top4Journeys = journeys.filter((j) => j.is_top4);

  // Tint bands per group — span the entire chart width
  const group1BandTop = padding.top;
  const group1BandBottom = yForLane(5) + laneHeight / 2;
  const group2BandTop = yForLane(6) - laneHeight / 2;
  const group2BandBottom = padding.top + innerHeight;

  function bracketPath(x: number, y1: number, y2: number, jut: number = 14): string {
    return `M ${x} ${y1} L ${x + jut} ${y1} L ${x + jut} ${y2} L ${x} ${y2}`;
  }

  type Matchup = { ya: number; yb: number; aWonRubbers: number; bWonRubbers: number };
  const sfMatchups: Matchup[] = [];
  for (const sf of semifinals) {
    const ja = journeys.find((j) => j.team_id === sf.team_a_id);
    const jb = journeys.find((j) => j.team_id === sf.team_b_id);
    if (ja?.ys.sf == null || jb?.ys.sf == null) continue;
    sfMatchups.push({
      ya: yForLane(ja.ys.sf),
      yb: yForLane(jb.ys.sf),
      aWonRubbers: sf.a_rubbers_won,
      bWonRubbers: sf.b_rubbers_won,
    });
  }
  const finalMatchup = (() => {
    if (!final) return null;
    const ja = journeys.find((j) => j.team_id === final.team_a_id);
    const jb = journeys.find((j) => j.team_id === final.team_b_id);
    if (ja?.ys.final == null || jb?.ys.final == null) return null;
    return {
      ya: yForLane(ja.ys.final),
      yb: yForLane(jb.ys.final),
      aWonRubbers: final.a_rubbers_won,
      bWonRubbers: final.b_rubbers_won,
    };
  })();

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto"
      role="img"
      aria-label="Tournament journey: from group stage to the final"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Group tint bands */}
      <rect
        x={0}
        y={group1BandTop}
        width={width}
        height={group1BandBottom - group1BandTop}
        className="fill-amber-50"
      />
      <rect
        x={0}
        y={group2BandTop}
        width={width}
        height={group2BandBottom - group2BandTop}
        className="fill-sky-50"
      />

      {/* Group labels are rendered as a small legend below the chart in the
          parent page, not inside the SVG — keeps the chart focused on data. */}

      {/* Stage column headers */}
      <text x={stageX.group} y={32} textAnchor="middle" className="fill-zinc-700 text-base font-semibold">
        Group Stage
      </text>
      <text x={stageX.sf} y={32} textAnchor="middle" className="fill-zinc-700 text-base font-semibold">
        Semifinals
      </text>
      <text x={stageX.final} y={32} textAnchor="middle" className="fill-zinc-700 text-base font-semibold">
        Final
      </text>

      {/* Vertical guidelines */}
      {[stageX.group, stageX.sf, stageX.final].map((x, i) => (
        <line
          key={`guide-${i}`}
          x1={x}
          y1={padding.top - 6}
          x2={x}
          y2={padding.top + innerHeight}
          className="stroke-zinc-200"
          strokeWidth={1}
          strokeDasharray="3 5"
        />
      ))}

      {/* All 12 teams: group-stage dot + name + W-L record */}
      {journeys.map((j) => {
        const x = stageX.group;
        const y = yForLane(j.ys.group);
        const isTop4 = j.is_top4;
        const nameClass = isTop4
          ? "fill-zinc-800 text-sm font-bold"
          : "fill-zinc-500 text-xs";
        const recordClass = isTop4
          ? "fill-zinc-500 text-xs font-medium"
          : "fill-zinc-400 text-[11px]";
        return (
          <g key={`group-${j.team_id}`}>
            <circle
              cx={x}
              cy={y}
              r={isTop4 ? 7 : 5}
              fill={j.color}
              stroke={isTop4 ? "white" : "none"}
              strokeWidth={isTop4 ? 2.5 : 0}
              opacity={isTop4 ? 1 : 0.7}
            />
            <text x={x - 14} y={y + 2} textAnchor="end" className={nameClass}>
              {j.team_name}
            </text>
            <text x={x - 14} y={y + 15} textAnchor="end" className={recordClass}>
              {j.group_record}
            </text>
          </g>
        );
      })}

      {/* Top-4 paths */}
      {top4Journeys.map((j) => (
        <path
          key={`path-${j.team_id}`}
          d={buildPath(j)}
          fill="none"
          stroke={j.color}
          strokeWidth={3.5}
          strokeLinecap="round"
        />
      ))}

      {/* Endpoint markers at SF and Final */}
      {top4Journeys.map((j) => {
        const points: { x: number; y: number; stage: string }[] = [];
        if (j.ys.sf !== null) points.push({ x: stageX.sf, y: yForLane(j.ys.sf), stage: "sf" });
        if (j.ys.final !== null) points.push({ x: stageX.final, y: yForLane(j.ys.final), stage: "final" });
        return points.map((p) => (
          <circle
            key={`dot-${j.team_id}-${p.stage}`}
            cx={p.x}
            cy={p.y}
            r={6.5}
            fill={j.color}
            stroke="white"
            strokeWidth={2.5}
          />
        ));
      })}

      {/* SF brackets */}
      {sfMatchups.map((m, i) => {
        const midY = (m.ya + m.yb) / 2;
        const x = stageX.sf;
        return (
          <g key={`sf-bracket-${i}`}>
            <path
              d={bracketPath(x, m.ya, m.yb, 14)}
              fill="none"
              stroke="#9CA3AF"
              strokeWidth={1.5}
            />
            <text
              x={x + 18}
              y={midY + 4}
              textAnchor="start"
              className="fill-zinc-600 text-xs font-semibold"
            >
              {m.aWonRubbers}-{m.bWonRubbers}
            </text>
          </g>
        );
      })}

      {/* Final bracket */}
      {finalMatchup && (
        <g>
          <path
            d={bracketPath(stageX.final, finalMatchup.ya, finalMatchup.yb, 14)}
            fill="none"
            stroke="#9CA3AF"
            strokeWidth={1.5}
          />
          <text
            x={stageX.final + 18}
            y={(finalMatchup.ya + finalMatchup.yb) / 2 + 4}
            textAnchor="start"
            className="fill-zinc-600 text-xs font-semibold"
          >
            {finalMatchup.aWonRubbers}-{finalMatchup.bWonRubbers}
          </text>
        </g>
      )}
    </svg>
  );
}
