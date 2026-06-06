import type { Team } from "@/types/database";

type StandingsTableProps = {
  teams: Team[];
};

export function StandingsTable({ teams }: StandingsTableProps) {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-emerald-500/20 bg-zinc-900/60 shadow-xl shadow-emerald-950/30">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-emerald-500/20 bg-emerald-500/10 text-emerald-100">
          <tr>
            <th className="px-4 py-3 font-semibold">Rank</th>
            <th className="px-4 py-3 font-semibold">Team</th>
            <th className="px-4 py-3 font-semibold">Owner</th>
            <th className="px-4 py-3 font-semibold">Record</th>
            <th className="px-4 py-3 text-right font-semibold">Points</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team, index) => (
            <tr
              key={team.id}
              className="border-b border-white/5 last:border-0 hover:bg-white/5"
            >
              <td className="px-4 py-3 text-zinc-400">{index + 1}</td>
              <td className="px-4 py-3 font-medium text-white">{team.name}</td>
              <td className="px-4 py-3 text-zinc-300">{team.owner_name}</td>
              <td className="px-4 py-3 text-zinc-300">
                {team.wins}-{team.losses}
              </td>
              <td className="px-4 py-3 text-right font-mono text-emerald-300">
                {Number(team.points_for).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
