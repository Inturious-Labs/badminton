import Image from "next/image";
import { JourneyChart } from "@/components/JourneyChart";
import { PairLeaderboards } from "@/components/PairLeaderboards";
import { PodiumSummary } from "@/components/PodiumSummary";
import { SectionNav } from "@/components/SectionNav";
import { StandingsTable } from "@/components/StandingsTable";
import { TeamSpotlight } from "@/components/TeamSpotlight";
import { getFinalRanking, loadTournament } from "@/lib/data";

export default function Page() {
  const data = loadTournament();
  const { champion } = getFinalRanking(data);
  const defaultTeamId = champion ?? data.teams[0].id;

  return (
    <>
      <SectionNav />
      <div className="w-full bg-zinc-900">
        <Image
          src="/hero.jpg"
          alt={data.tournament.name}
          width={1191}
          height={603}
          priority
          className="w-full h-auto max-h-[60vh] object-cover"
        />
      </div>
      <main className="mx-auto max-w-6xl px-3 sm:px-6 py-8 sm:py-12 text-zinc-900">
        <header id="overview" className="mb-8 px-1 scroll-mt-16">
          <h1 className="text-base sm:text-2xl font-semibold tracking-tight whitespace-nowrap">
            {data.tournament.name}
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-zinc-600 whitespace-nowrap">
            {data.tournament.start_date} · {data.tournament.venue}
          </p>
          <p className="mt-1 text-xs sm:text-sm text-zinc-500">
            12 schools · 30 group ties · 4 knockout ties · 92 rubbers played
          </p>
        </header>

        <section className="mb-12">
          <div className="px-1 mb-4">
            <h2 className="text-xl font-semibold">The Journey to the Podium</h2>
          </div>

          <div className="bg-white border border-zinc-200 rounded-lg p-3 sm:p-5 mb-4">
            <PodiumSummary data={data} />
          </div>

          <div className="bg-white border border-zinc-200 rounded-lg p-1 sm:p-4">
            <JourneyChart data={data} />
            <div className="flex items-center justify-center gap-3 text-[10px] text-zinc-400 pt-0.5 pb-0.5">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm bg-amber-50 border border-amber-200" />
                Group 1
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm bg-sky-50 border border-sky-200" />
                Group 2
              </span>
            </div>
          </div>
        </section>

        <section id="standings" className="mb-12 scroll-mt-16">
          <div className="px-1 mb-4">
            <h2 className="text-xl font-semibold">Group Standings</h2>
            <p className="text-sm text-zinc-600 mt-1">
              Click a team row to see its detailed breakdown.
            </p>
          </div>
          <StandingsTable data={data} />

          <div className="mt-6 px-1 text-sm space-y-4 max-w-2xl [overflow-wrap:anywhere]">
            <div>
              <p className="font-medium text-zinc-800 mb-1">
                团体赛小组赛排名规则 · Group Stage Ranking Rules
              </p>
              <p className="text-zinc-600 leading-relaxed">
                小组赛阶段：采用单循环赛制，对阵两队之间依次进行男双、女双、混双三场比赛且打满全部项目，一方取得两场及以上胜利即为该场比赛获胜方；小组排名按以下规则决定名次：按获胜场次多少决出小组前两名出线；若有两队获胜场次相同，则按相互胜负关系决定名次；若有三队获胜场次相同，则依次比较净胜局、净胜分、总得分、胜负关系。
              </p>
              <p className="text-zinc-500 mt-2 leading-relaxed text-xs">
                Round-robin within each group. Each tie is three matches (MD, WD, XD) played to
                completion; the team that wins 2+ matches wins the tie. Standings are determined by:
                (1) tie wins; (2) if 2 teams are tied, head-to-head result decides; (3) if 3+ teams
                are tied, compare in order — net rubbers, net points, total points, then head-to-head.
              </p>
            </div>

            <div className="border-t border-zinc-200 pt-3">
              <p className="font-medium text-zinc-800 mb-1">Column Definitions</p>
              <ul className="space-y-1 text-zinc-600 text-xs leading-relaxed">
                <li>
                  <span className="font-medium text-zinc-700">W-L</span> — Ties won and lost
                  (each tie = best-of-3 rubbers). <em className="text-zinc-500">Primary ranking criterion.</em>
                </li>
                <li>
                  <span className="font-medium text-zinc-700">Rub</span> — Rubbers won and lost
                  across all ties (each rubber = one MD, WD, or XD match).
                  <em className="text-zinc-500"> Net rubbers (won − lost) is the first tiebreaker for 3+ tied teams.</em>
                </li>
                <li>
                  <span className="font-medium text-zinc-700">Net</span> — Net points (points
                  scored − points conceded across all rubbers).
                  <em className="text-zinc-500"> Second tiebreaker.</em>
                </li>
                <li>
                  <span className="font-medium text-zinc-700">Pts</span> — Total points scored
                  across all rubbers (each rubber is a single game to 21).
                  <em className="text-zinc-500"> Third tiebreaker.</em>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section id="team-spotlight" className="mb-12 scroll-mt-16">
          <div className="px-1 mb-4">
            <h2 className="text-xl font-semibold">Team Spotlight</h2>
          </div>
          <div className="bg-white border border-zinc-200 rounded-lg p-4 sm:p-6">
            <TeamSpotlight data={data} defaultTeamId={defaultTeamId} />
          </div>
        </section>

        <section id="pair-leaderboards" className="mb-12 scroll-mt-16">
          <div className="px-1 mb-4">
            <h2 className="text-xl font-semibold">Pair Leaderboards</h2>
            <p className="text-sm text-zinc-600 mt-1">
              Every pairing deployed in the tournament, ranked by win rate then net points.
            </p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-lg p-4 sm:p-6">
            <PairLeaderboards data={data} />
          </div>
        </section>

        <footer className="text-xs text-zinc-400 pt-8 mt-8 border-t border-zinc-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p>Data sourced from the official WeChat mini-program.</p>
          <p>
            © {new Date().getFullYear()} A project by{" "}
            <a
              href="https://inturious.com"
              className="text-zinc-600 hover:text-zinc-900 underline underline-offset-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              Inturious Labs
            </a>
          </p>
        </footer>
      </main>
    </>
  );
}
