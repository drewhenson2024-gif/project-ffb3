import { disambiguatedLabel } from "@/lib/normalize-name";
import { createServerClient } from "@/lib/supabase/server";
import type { FantasySeasonStats, PlayerProfile } from "@/types/database";
import Link from "next/link";
import { notFound } from "next/navigation";

type PlayerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PlayerPage({ params }: PlayerPageProps) {
  const { id } = await params;
  const playerId = Number(id);

  if (!Number.isFinite(playerId)) notFound();

  const supabase = createServerClient();

  const { data: profile, error: profileError } = await supabase
    .from("player_profiles")
    .select("*")
    .eq("player_id", playerId)
    .single();

  if (profileError || !profile) notFound();

  const player = profile as PlayerProfile;

  const { data: seasons } = await supabase
    .from("fantasy_season_stats")
    .select("*")
    .eq("player_id", playerId)
    .order("season_year", { ascending: true });

  const label = disambiguatedLabel(
    player.full_name,
    player.draft_year,
    player.debut_season,
  );

  return (
    <div className="min-h-full bg-gradient-to-b from-emerald-950 via-zinc-950 to-black text-white">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-16">
        <Link href="/players" className="text-sm text-emerald-400 hover:text-emerald-300">
          ← All players
        </Link>

        <header>
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-400">
            {player.primary_position}
            {player.is_undrafted ? " · Undrafted" : ""}
          </p>
          <h1 className="mt-2 text-4xl font-bold">{label}</h1>
          <p className="mt-3 text-zinc-400">
            {player.is_undrafted
              ? "Verified undrafted — no skill-position draft record"
              : player.draft_year
                ? `Drafted ${player.draft_year}, round ${player.draft_round}, pick ${player.draft_pick_overall} (${player.drafting_team})`
                : "No draft record in database"}
            {player.college ? ` · ${player.college}` : ""}
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          <Stat label="Career PPR" value={fmt(player.fantasy_points_ppr)} />
          <Stat label="Games" value={String(player.games_played ?? 0)} />
          <Stat label="Seasons" value={String(player.seasons_played ?? 0)} />
        </section>

        <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-6">
          <h2 className="text-lg font-semibold">Season log</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="text-zinc-400">
                <tr>
                  <th className="pb-2 pr-4">Year</th>
                  <th className="pb-2 pr-4">Team</th>
                  <th className="pb-2 pr-4">GP</th>
                  <th className="pb-2 text-right">PPR pts</th>
                </tr>
              </thead>
              <tbody>
                {(seasons as FantasySeasonStats[] | null)?.map((season) => (
                  <tr key={season.id} className="border-t border-white/5">
                    <td className="py-2 pr-4">{season.season_year}</td>
                    <td className="py-2 pr-4 text-zinc-400">{season.team ?? "—"}</td>
                    <td className="py-2 pr-4">{season.games_played}</td>
                    <td className="py-2 text-right font-mono text-emerald-300">
                      {Number(season.fantasy_points_ppr).toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5">
      <p className="text-sm text-emerald-200/80">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function fmt(value: number | null | undefined): string {
  return Number(value ?? 0).toFixed(1);
}
