import type { Position } from "@/types/database";
import {
  DEFAULT_LEAGUE_CONFIG,
  type LeagueConfig,
  type ScoringStyle,
} from "./types";

function parseIntParam(
  value: string | undefined,
  fallback: number,
  min = 1,
  max = 64,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function parseScoring(value: string | undefined): ScoringStyle {
  if (value === "half_ppr" || value === "standard" || value === "ppr") {
    return value;
  }
  return DEFAULT_LEAGUE_CONFIG.scoring;
}

export function parseLeagueConfig(
  params: Record<string, string | string[] | undefined>,
): LeagueConfig {
  const get = (key: string) => {
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };

  return {
    teams: parseIntParam(get("teams"), DEFAULT_LEAGUE_CONFIG.teams, 2, 32),
    starting: {
      QB: parseIntParam(get("qb"), DEFAULT_LEAGUE_CONFIG.starting.QB, 0, 3),
      RB: parseIntParam(get("rb"), DEFAULT_LEAGUE_CONFIG.starting.RB, 0, 5),
      WR: parseIntParam(get("wr"), DEFAULT_LEAGUE_CONFIG.starting.WR, 0, 5),
      TE: parseIntParam(get("te"), DEFAULT_LEAGUE_CONFIG.starting.TE, 0, 3),
    },
    benchSpots: parseIntParam(
      get("bench"),
      DEFAULT_LEAGUE_CONFIG.benchSpots,
      0,
      15,
    ),
    taxiSpots: parseIntParam(
      get("taxi"),
      DEFAULT_LEAGUE_CONFIG.taxiSpots,
      0,
      10,
    ),
    scoring: parseScoring(get("scoring")),
  };
}

export function configToSearchParams(config: LeagueConfig): URLSearchParams {
  const params = new URLSearchParams();
  params.set("teams", String(config.teams));
  params.set("qb", String(config.starting.QB));
  params.set("rb", String(config.starting.RB));
  params.set("wr", String(config.starting.WR));
  params.set("te", String(config.starting.TE));
  params.set("bench", String(config.benchSpots));
  params.set("taxi", String(config.taxiSpots));
  params.set("scoring", config.scoring);
  return params;
}

export function tierLabel(tier: string): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export function positionLabel(position: Position): string {
  return position;
}
