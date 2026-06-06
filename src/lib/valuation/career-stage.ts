export type CareerQuartile = 1 | 2 | 3 | 4;

export const CAREER_QUARTILE_LABELS: Record<CareerQuartile, string> = {
  1: "early",
  2: "mid-early",
  3: "mid-late",
  4: "late",
};

/**
 * Career progress quartile using known or estimated total career length.
 * Q1 = first 25% of career, Q4 = final 25%.
 */
export function careerQuartile(
  yearsPlayed: number,
  totalSeasons: number,
): CareerQuartile {
  const progress = yearsPlayed / Math.max(totalSeasons, 1);
  if (progress <= 0.25) return 1;
  if (progress <= 0.5) return 2;
  if (progress <= 0.75) return 3;
  return 4;
}

export function estimateTotalSeasons(
  positionMedians: Map<string, number>,
  position: string,
  yearsPlayed: number,
): number {
  const medianLength = positionMedians.get(position);
  if (!medianLength || medianLength <= yearsPlayed) {
    return Math.max(yearsPlayed + 2, yearsPlayed);
  }
  return medianLength;
}
