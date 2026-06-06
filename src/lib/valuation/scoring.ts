import type { ScoringStyle } from "./types";

export function scoringColumn(
  scoring: ScoringStyle,
): "fantasy_points_ppr" | "fantasy_points_half_ppr" | "fantasy_points_standard" {
  switch (scoring) {
    case "half_ppr":
      return "fantasy_points_half_ppr";
    case "standard":
      return "fantasy_points_standard";
    default:
      return "fantasy_points_ppr";
  }
}

export function scoringLabel(scoring: ScoringStyle): string {
  switch (scoring) {
    case "half_ppr":
      return "Half PPR";
    case "standard":
      return "Standard";
    default:
      return "PPR";
  }
}
