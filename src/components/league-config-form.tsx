"use client";

import { configToSearchParams } from "@/lib/valuation/parse-config";
import type { LeagueConfig, ScoringStyle } from "@/lib/valuation/types";
import { useRouter } from "next/navigation";

type LeagueConfigFormProps = {
  config: LeagueConfig;
};

export function LeagueConfigForm({ config }: LeagueConfigFormProps) {
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const next: LeagueConfig = {
      teams: Number(form.get("teams")),
      starting: {
        QB: Number(form.get("qb")),
        RB: Number(form.get("rb")),
        WR: Number(form.get("wr")),
        TE: Number(form.get("te")),
      },
      benchSpots: Number(form.get("bench")),
      taxiSpots: Number(form.get("taxi")),
      scoring: form.get("scoring") as ScoringStyle,
    };
    const params = configToSearchParams(next);
    router.push(`/valuation?${params.toString()}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-6 rounded-2xl border border-white/10 bg-zinc-900/50 p-6"
    >
      <div>
        <h2 className="text-lg font-semibold text-white">League settings</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Thresholds scale with teams, starters, and bench size. Taxi slots are
          saved for a later dynasty step.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Teams" name="teams" defaultValue={config.teams} min={2} max={32} />
        <Field label="Bench spots (per team)" name="bench" defaultValue={config.benchSpots} min={0} max={15} />
        <Field label="Taxi spots (per team)" name="taxi" defaultValue={config.taxiSpots} min={0} max={10} />
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Scoring</label>
          <select
            name="scoring"
            defaultValue={config.scoring}
            className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white"
          >
            <option value="ppr">PPR</option>
            <option value="half_ppr">Half PPR</option>
            <option value="standard">Standard</option>
          </select>
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-zinc-300">Starters per team</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="QB" name="qb" defaultValue={config.starting.QB} min={0} max={3} />
          <Field label="RB" name="rb" defaultValue={config.starting.RB} min={0} max={5} />
          <Field label="WR" name="wr" defaultValue={config.starting.WR} min={0} max={5} />
          <Field label="TE" name="te" defaultValue={config.starting.TE} min={0} max={3} />
        </div>
      </div>

      <button
        type="submit"
        className="w-fit rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-emerald-400"
      >
        Calculate valuation
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  min,
  max,
}: {
  label: string;
  name: string;
  defaultValue: number;
  min: number;
  max: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm text-zinc-400">{label}</label>
      <input
        type="number"
        name={name}
        defaultValue={defaultValue}
        min={min}
        max={max}
        className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white"
      />
    </div>
  );
}
