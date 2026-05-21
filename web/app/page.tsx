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

        <footer className="text-xs text-zinc-400 pt-8 border-t border-zinc-200">
          Data sourced from the official WeChat mini-program.
        </footer>
      </main>
    </>
  );
}
