import { PlayersTable } from "@/components/players-table";
import { createServerClient } from "@/lib/supabase/server";
import type { PlayerProfile } from "@/types/database";
import Link from "next/link";

type PlayersPageProps = {
  searchParams: Promise<{
    position?: string;
    undrafted?: string;
  }>;
};

export default async function PlayersPage({ searchParams }: PlayersPageProps) {
  const params = await searchParams;
  const position = params.position?.toUpperCase();
  const undraftedOnly = params.undrafted === "1";

  const supabase = createServerClient();
  let query = supabase
    .from("player_profiles")
    .select("*")
    .order("fantasy_points_ppr", { ascending: false, nullsFirst: false })
    .limit(100);

  if (position && ["QB", "RB", "WR", "TE"].includes(position)) {
    query = query.eq("primary_position", position);
  }

  if (undraftedOnly) {
    query = query.eq("is_undrafted", true);
  }

  const { data, error } = await query;

  return (
    <div className="min-h-full bg-gradient-to-b from-emerald-950 via-zinc-950 to-black text-white">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-16">
        <header>
          <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300">
            ← Home
          </Link>
          <h1 className="mt-4 text-4xl font-bold tracking-tight">
            Player Career Rankings
          </h1>
          <p className="mt-3 max-w-2xl text-zinc-400">
            Top career fantasy scorers (PPR) since 2000, linked to draft history
            back to 1980.
          </p>
        </header>

        <div className="flex flex-wrap gap-2">
          <FilterLink label="All" href="/players" active={!position && !undraftedOnly} />
          <FilterLink
            label="QB"
            href="/players?position=QB"
            active={position === "QB"}
          />
          <FilterLink
            label="RB"
            href="/players?position=RB"
            active={position === "RB"}
          />
          <FilterLink
            label="WR"
            href="/players?position=WR"
            active={position === "WR"}
          />
          <FilterLink
            label="TE"
            href="/players?position=TE"
            active={position === "TE"}
          />
          <FilterLink
            label="Undrafted"
            href="/players?undrafted=1"
            active={undraftedOnly}
          />
        </div>

        {error ? (
          <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
            Could not load players: {error.message}
          </p>
        ) : (
          <PlayersTable players={(data ?? []) as PlayerProfile[]} />
        )}
      </main>
    </div>
  );
}

function FilterLink({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-emerald-500 text-black"
          : "border border-white/10 bg-zinc-900/60 text-zinc-300 hover:border-emerald-500/40"
      }`}
    >
      {label}
    </Link>
  );
}
