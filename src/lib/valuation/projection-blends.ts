import type { CareerQuartile } from "./career-stage";
import type { Position } from "@/types/database";
import type { ProjectionBlend } from "./projection-predict";

/**
 * Comp/regression blend weights tuned via `npm run backtest:projection`.
 * 80/20 player split, default 16-team PPR, tight comps then loose if n < 5.
 */
export const BACKTEST_TUNED_COMP_WEIGHT: Record<
  Position,
  Record<CareerQuartile, number>
> = {
  QB: { 1: 0.5, 2: 0.25, 3: 0.5, 4: 0 },
  RB: { 1: 0, 2: 0.25, 3: 0.75, 4: 0 },
  WR: { 1: 0, 2: 0, 3: 0.25, 4: 1 },
  TE: { 1: 0.25, 2: 0, 3: 0.25, 4: 0.25 },
};

export function tunedBlend(
  position: Position,
  quartile: CareerQuartile,
): ProjectionBlend {
  return { compWeight: BACKTEST_TUNED_COMP_WEIGHT[position][quartile] };
}
