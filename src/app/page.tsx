import { SetupNotice } from "@/components/setup-notice";
import { createServerClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = createServerClient();

  const { count: playerCount, error: playerError } = await supabase
    .from("players")
    .select("*", { count: "exact", head: true });

  const { count: careerCount, error: careerError } = await supabase
    .from("player_career_stats")
    .select("*", { count: "exact", head: true });

  const error = playerError ?? careerError;
  const isMissingTable =
    error?.code === "PGRST205" ||
    error?.message.toLowerCase().includes("could not find the table");

  const isReady = !error && (playerCount ?? 0) > 0;

  return (
    <div className="min-h-full bg-gradient-to-b from-emerald-950 via-zinc-950 to-black text-white">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-16">
        <header>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
            Project FFB3
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">
            Fantasy Football Database
          </h1>
          <p className="mt-3 max-w-2xl text-zinc-400">
            Normalized player, draft, and career fantasy data from 2000 onward.
          </p>
        </header>

        {error && isMissingTable ? (
          <SetupNotice message="The player database schema has not been created yet. Run the migration SQL files in your Supabase project." />
        ) : error ? (
          <SetupNotice message={`Could not reach the database: ${error.message}`} />
        ) : isReady ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Players" value={playerCount ?? 0} />
            <StatCard label="Career profiles" value={careerCount ?? 0} />
            <StatCard label="Data range" value="2000+" />
          </div>
        ) : (
          <SetupNotice message="Schema is ready. Import raw draft and fantasy season data, then run select refresh_player_career_stats(); in the SQL Editor to build career totals." />
        )}

        <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-6">
          <h2 className="text-lg font-semibold text-white">Data model</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <DataModelItem
              title="players"
              description="Master player records linking draft and fantasy data"
            />
            <DataModelItem
              title="draft_picks"
              description="Every draft class since 2000 (round, pick, team, college)"
            />
            <DataModelItem
              title="fantasy_season_stats"
              description="Raw yearly fantasy stats for QBs, RBs, WRs, TEs"
            />
            <DataModelItem
              title="player_career_stats"
              description="Transformed career totals tied to draft position"
            />
          </dl>
        </section>
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5">
      <p className="text-sm text-emerald-200/80">{label}</p>
      <p className="mt-1 text-3xl font-bold text-white">{value}</p>
    </div>
  );
}

function DataModelItem({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <dt className="font-mono text-emerald-300">{title}</dt>
      <dd className="mt-1 text-zinc-400">{description}</dd>
    </div>
  );
}
