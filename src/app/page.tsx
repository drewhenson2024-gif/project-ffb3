import { SetupNotice } from "@/components/setup-notice";
import { StandingsTable } from "@/components/standings-table";
import { createServerClient } from "@/lib/supabase/server";
import type { Team } from "@/types/database";

export default async function Home() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .order("points_for", { ascending: false });

  const isMissingTable =
    error?.code === "PGRST205" ||
    error?.message.toLowerCase().includes("could not find the table");

  return (
    <div className="min-h-full bg-gradient-to-b from-emerald-950 via-zinc-950 to-black text-white">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-16">
        <header>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
            Project FFB3
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">
            League Standings
          </h1>
          <p className="mt-3 max-w-2xl text-zinc-400">
            Fantasy football standings pulled live from Supabase.
          </p>
        </header>

        {error && isMissingTable ? (
          <SetupNotice message="The teams table has not been created yet. Run the migration SQL in your Supabase project to seed sample league data." />
        ) : error ? (
          <SetupNotice message={`Could not load standings: ${error.message}`} />
        ) : data && data.length > 0 ? (
          <StandingsTable teams={data as Team[]} />
        ) : (
          <SetupNotice message="No teams found. Run the migration SQL to add sample data." />
        )}
      </main>
    </div>
  );
}
