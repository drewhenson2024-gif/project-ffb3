/**
 * Projection model tuning knobs. Adjust via backtest ablation (npm run ablate:recent).
 */
export const PROJECTION_CONFIG = {
  /**
   * Scale applied to recent-performance regression inputs (0–1).
   * Lower = career totals and peak tier matter more than last 3 seasons.
   */
  recentFeatureScale: 0,

  /** When false, career-length estimate uses age + peak tier only (not recent tiers). */
  recentAffectsCareerLength: false,

  /** Dynasty rank blend disabled — use dynasty file for validation only. */
  dynastyCalibrationWeight: 0,
} as const;
