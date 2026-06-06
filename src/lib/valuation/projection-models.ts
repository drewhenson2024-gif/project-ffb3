import type { Position } from "@/types/database";
import { VALUABLE_TIERS, type ValuableTier } from "./career-pab";
import type { CareerQuartile } from "./career-stage";
import { fitOls, predictOls, type OlsModel } from "./regression";
import type { ProjectionCheckpoint } from "./checkpoints";

export const PROJECTION_FEATURE_NAMES = [
  "log_draft_pick",
  "is_undrafted",
  "years_played",
  "elite_so_far",
  "star_so_far",
  "starter_so_far",
  "peak_tier",
  "games_played",
  "age_proxy",
  "recent_elite",
  "recent_star",
  "recent_starter",
  "recent_valuable_seasons",
  "recent_pab_rate",
  "last_season_tier",
  "momentum",
] as const;

export type QuartileModelKey = `${Position}-Q${CareerQuartile}`;

export type TierTargetModels = Record<ValuableTier, OlsModel | null>;

export type ProjectionModelBundle = {
  byQuartile: Map<QuartileModelKey, TierTargetModels>;
  byPosition: Map<Position, TierTargetModels>;
};

function modelKey(position: Position, quartile: CareerQuartile): QuartileModelKey {
  return `${position}-Q${quartile}`;
}

export function checkpointFeatures(checkpoint: ProjectionCheckpoint): number[] {
  const draftPick = checkpoint.draftPick ?? 256;
  return [
    Math.log(draftPick),
    checkpoint.isUndrafted ? 1 : 0,
    checkpoint.yearsPlayed,
    checkpoint.tiersSoFar.elite,
    checkpoint.tiersSoFar.star,
    checkpoint.tiersSoFar.starter,
    checkpoint.peakTier,
    checkpoint.gamesPlayed,
    checkpoint.ageProxy ?? checkpoint.yearsPlayed + 22,
    checkpoint.recentElite,
    checkpoint.recentStar,
    checkpoint.recentStarter,
    checkpoint.recentValuableSeasons,
    checkpoint.recentPabRate,
    checkpoint.lastSeasonTier,
    checkpoint.momentum,
  ];
}

function trainTierModels(rows: ProjectionCheckpoint[]): TierTargetModels {
  if (rows.length < 20) {
    return { elite: null, star: null, starter: null };
  }

  const X = rows.map((row) => checkpointFeatures(row));
  const models = {} as TierTargetModels;

  for (const tier of VALUABLE_TIERS) {
    const y = rows.map((row) => row.remainingTiers[tier]);
    models[tier] = fitOls(X, y);
  }

  return models;
}

export function trainProjectionModels(
  checkpoints: ProjectionCheckpoint[],
): ProjectionModelBundle {
  const byQuartile = new Map<QuartileModelKey, TierTargetModels>();
  const byPosition = new Map<Position, TierTargetModels>();

  const positions = ["QB", "RB", "WR", "TE"] as Position[];
  const quartiles = [1, 2, 3, 4] as CareerQuartile[];

  for (const position of positions) {
    const positionRows = checkpoints.filter((row) => row.position === position);
    byPosition.set(position, trainTierModels(positionRows));

    for (const quartile of quartiles) {
      const rows = positionRows.filter((row) => row.careerQuartile === quartile);
      byQuartile.set(modelKey(position, quartile), trainTierModels(rows));
    }
  }

  return { byQuartile, byPosition };
}

function getModels(
  bundle: ProjectionModelBundle,
  position: Position,
  quartile: CareerQuartile,
): TierTargetModels {
  const quartileModels = bundle.byQuartile.get(modelKey(position, quartile));
  const hasQuartileModel = quartileModels && Object.values(quartileModels).some(Boolean);
  if (hasQuartileModel) return quartileModels!;
  return bundle.byPosition.get(position) ?? { elite: null, star: null, starter: null };
}

export function predictRemainingTiers(
  bundle: ProjectionModelBundle,
  checkpoint: ProjectionCheckpoint,
): Record<ValuableTier, number> {
  const models = getModels(bundle, checkpoint.position, checkpoint.careerQuartile);
  const features = checkpointFeatures(checkpoint);
  const prediction = { elite: 0, star: 0, starter: 0 };

  for (const tier of VALUABLE_TIERS) {
    const model = models[tier];
    prediction[tier] = model ? Math.max(0, predictOls(model, features)) : 0;
  }

  return prediction;
}
