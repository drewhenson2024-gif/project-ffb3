import {
  careerPabFromTierCounts,
  type TierPabRates,
  type TierSeasonCounts,
  VALUABLE_TIERS,
} from "./career-pab";
import type { ProjectionCheckpoint } from "./checkpoints";
import {
  findCompRemainingTiers,
  type CompCandidate,
  type CompQuery,
} from "./comp-matching";
import {
  predictRemainingTiers,
  type ProjectionModelBundle,
} from "./projection-models";
import { tunedBlend } from "./projection-blends";

export type ProjectionBlend = {
  compWeight: number;
};

export function checkpointToCompQuery(checkpoint: ProjectionCheckpoint): CompQuery {
  return {
    position: checkpoint.position,
    yearsPlayed: checkpoint.yearsPlayed,
    careerQuartile: checkpoint.careerQuartile,
    isUndrafted: checkpoint.isUndrafted,
    draftPick: checkpoint.draftPick,
    tiersSoFar: checkpoint.tiersSoFar,
  };
}

export function checkpointToCompCandidate(
  checkpoint: ProjectionCheckpoint,
): CompCandidate {
  return {
    playerId: checkpoint.playerId,
    position: checkpoint.position,
    yearsPlayed: checkpoint.yearsPlayed,
    careerQuartile: checkpoint.careerQuartile,
    isUndrafted: checkpoint.isUndrafted,
    draftPick: checkpoint.draftPick,
    tiersSoFar: checkpoint.tiersSoFar,
    remainingTiers: checkpoint.remainingTiers,
  };
}

export function blendTierPredictions(
  regression: TierSeasonCounts,
  comp: TierSeasonCounts,
  blend: ProjectionBlend,
): TierSeasonCounts {
  const regressionWeight = 1 - blend.compWeight;
  const result = { elite: 0, star: 0, starter: 0 };

  for (const tier of VALUABLE_TIERS) {
    result[tier] = Math.max(
      0,
      regressionWeight * regression[tier] + blend.compWeight * comp[tier],
    );
  }

  return result;
}

export function predictCheckpoint(
  bundle: ProjectionModelBundle,
  compPool: CompCandidate[],
  checkpoint: ProjectionCheckpoint,
  rates: TierPabRates,
  blend: ProjectionBlend,
): {
  predictedTiers: TierSeasonCounts;
  predictedPab: number;
  regressionTiers: TierSeasonCounts;
  compTiers: TierSeasonCounts;
  compSampleSize: number;
  compMatchType: string;
} {
  const regression = predictRemainingTiers(bundle, checkpoint);
  const compResult = findCompRemainingTiers(compPool, checkpointToCompQuery(checkpoint));
  const predictedTiers = blendTierPredictions(regression, compResult.expectations, blend);
  const predictedPab = careerPabFromTierCounts(predictedTiers, rates);

  return {
    predictedTiers,
    predictedPab,
    regressionTiers: regression,
    compTiers: compResult.expectations,
    compSampleSize: compResult.sampleSize,
    compMatchType: compResult.matchType,
  };
}

export function predictCheckpointTuned(
  bundle: ProjectionModelBundle,
  compPool: CompCandidate[],
  checkpoint: ProjectionCheckpoint,
  rates: TierPabRates,
) {
  const blend = tunedBlend(checkpoint.position, checkpoint.careerQuartile);
  return predictCheckpoint(bundle, compPool, checkpoint, rates, blend);
}
