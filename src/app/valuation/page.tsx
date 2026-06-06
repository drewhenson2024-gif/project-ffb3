import { LeagueConfigForm } from "@/components/league-config-form";
import { ValuationResults } from "@/components/valuation-results";
import { computeValuation } from "@/lib/valuation/pab";
import { parseLeagueConfig } from "@/lib/valuation/parse-config";
import { DEFAULT_LEAGUE_CONFIG } from "@/lib/valuation/types";
import { createServerClient } from "@/lib/supabase/server";
import type { FantasySeasonStats } from "@/types/database";
import Link from "next/link";

type ValuationPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ValuationPage({ searchParams }: ValuationPageProps) {
  const params = await searchParams;
  const hasParams = Object.keys(params).length > 0;
  const config = hasParams ? parseLeagueConfig(params) : DEFAULT_LEAGUE_CONFIG;

  const supabase = createServerClient();
  const { data: seasons, error } = await supabase
    .from("fantasy_season_stats")
    .select(
      "season_year, position, fantasy_points_ppr, fantasy_points_half_ppr, fantasy_points_standard",
    );

  const valuation =
    seasons && seasons.length > 0
      ? computeValuation(config, seasons as FantasySeasonStats[])
      : null;

  return (
    <div className="min-h-full bg-gradient-to-b from-emerald-950 via-zinc-950 to-black text-white">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-16">
        <header>
          <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300">
            ← Home
          </Link>
          <h1 className="mt-4 text-4xl font-bold tracking-tight">
            Player Valuation
          </h1>
          <p className="mt-3 max-w-2xl text-zinc-400">
            Season tier thresholds from your league size and roster construction.
            PAB values use the last six seasons of database history.
          </p>
        </header>

        <LeagueConfigForm config={config} />

        {error ? (
          <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
            Could not load season data: {error.message}
          </p>
        ) : valuation ? (
          <ValuationResults
            config={config}
            years={valuation.years}
            positions={valuation.positions}
          />
        ) : (
          <p className="text-zinc-400">Import season data to run valuations.</p>
        )}
      </main>
    </div>
  );
}
