import { disambiguatedLabel } from "@/lib/normalize-name";
import type { PlayerProfile } from "@/types/database";
import Link from "next/link";

type PlayersTableProps = {
  players: PlayerProfile[];
};

export function PlayersTable({ players }: PlayersTableProps) {
  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-emerald-500/20 bg-zinc-900/60 shadow-xl shadow-emerald-950/30">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-emerald-500/20 bg-emerald-500/10 text-emerald-100">
          <tr>
            <th className="px-4 py-3 font-semibold">Player</th>
            <th className="px-4 py-3 font-semibold">Pos</th>
            <th className="px-4 py-3 font-semibold">Draft</th>
            <th className="px-4 py-3 font-semibold">Seasons</th>
            <th className="px-4 py-3 text-right font-semibold">Career PPR</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => {
            const label = disambiguatedLabel(
              player.full_name,
              player.draft_year,
              player.debut_season,
            );
            const draftLabel = player.is_undrafted
              ? "Undrafted"
              : player.draft_year
                ? `${player.draft_year} · #${player.draft_pick_overall}`
                : "—";

            return (
              <tr
                key={player.player_id}
                className="border-b border-white/5 last:border-0 hover:bg-white/5"
              >
                <td className="px-4 py-3 font-medium text-white">
                  <Link
                    href={`/players/${player.player_id}`}
                    className="hover:text-emerald-300"
                  >
                    {label}
                  </Link>
                </td>
                <td className="px-4 py-3 text-zinc-300">
                  {player.primary_position}
                </td>
                <td className="px-4 py-3 text-zinc-400">{draftLabel}</td>
                <td className="px-4 py-3 text-zinc-400">
                  {player.seasons_played ?? 0}
                </td>
                <td className="px-4 py-3 text-right font-mono text-emerald-300">
                  {Number(player.fantasy_points_ppr ?? 0).toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
