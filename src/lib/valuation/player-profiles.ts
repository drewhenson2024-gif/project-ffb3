import type { Position } from "@/types/database";
import {
  careerPabFromTierCounts,
  emptyTierSeasonCounts,
  incrementTierCount,
  seasonPabContribution,
  toValuableTierPab,
  type TierPabRates,
  type TierSeasonCounts,
} from "./career-pab";
import { classifyRank, getPositionThresholds } from "./thresholds";
import { scoringColumn } from "./scoring";
import { computeValuation } from "./pab";
import type { LeagueConfig, SeasonTier } from "./types";

export type SeasonStatRow = {
  player_id: number;
  season_year: number;
  position: Position;
  fantasy_points_ppr: number;
  fantasy_points_half_ppr: number;
  fantasy_points_standard: number;
  games_played?: number;
};

export type CareerMeta = {
  player_id: number;
  draft_year: number | null;
  draft_pick_overall: number | null;
  draft_position: Position | null;
  first_season: number | null;
  last_season: number | null;
};

export type RookieCareerProfile = {
  playerId: number;
  draftYear: number;
  draftPick: number;
  position: Position;
  tierCounts: TierSeasonCounts;
  careerPab: number;
};

function getPoints(row: SeasonStatRow, config: LeagueConfig): number {
  return Number(row[scoringColumn(config.scoring)] ?? 0);
}

export function buildTierRatesByPosition(
  config: LeagueConfig,
  seasons: SeasonStatRow[],
  valuationYears: number[],
): Map<Position, TierPabRates> {
  const { positions } = computeValuation(config, seasons, valuationYears);
  return new Map(
    positions.map((p) => [p.position, toValuableTierPab(p.pab)]),
  );
}

export function buildPlayerSeasonPab(
  seasons: SeasonStatRow[],
  config: LeagueConfig,
  ratesByPosition: Map<Position, TierPabRates>,
): Map<
  number,
  Map<
    number,
    { tier: SeasonTier | null; pab: number; position: Position; games: number }
  >
> {
  const byPlayer = new Map<
    number,
    Map<
      number,
      { tier: SeasonTier | null; pab: number; position: Position; games: number }
    >
  >();
  const years = [...new Set(seasons.map((s) => s.season_year))];

  for (const year of years) {
    for (const position of ["QB", "RB", "WR", "TE"] as Position[]) {
      const thresholds = getPositionThresholds(config, position);
      const rates = ratesByPosition.get(position)!;
      const yearRows = seasons
        .filter((s) => s.season_year === year && s.position === position)
        .sort((a, b) => getPoints(b, config) - getPoints(a, config));

      yearRows.forEach((row, index) => {
        const tier = classifyRank(index + 1, thresholds);
        if (!byPlayer.has(row.player_id)) byPlayer.set(row.player_id, new Map());
        byPlayer.get(row.player_id)!.set(year, {
          tier,
          pab: seasonPabContribution(tier, rates),
          position: row.position,
          games: row.games_played ?? 0,
        });
      });
    }
  }

  return byPlayer;
}

export function buildRookieProfiles(
  seasonPab: Map<
    number,
    Map<number, { tier: SeasonTier | null; pab: number; position: Position }>
  >,
  careers: CareerMeta[],
  completeIds: Set<number>,
): RookieCareerProfile[] {
  const profiles: RookieCareerProfile[] = [];

  for (const career of careers) {
    if (!completeIds.has(career.player_id)) continue;
    if (!career.draft_year || !career.draft_pick_overall || !career.draft_position) {
      continue;
    }
    if (career.draft_year < 2000) continue;

    const seasons = seasonPab.get(career.player_id);
    if (!seasons) continue;

    const tierCounts = emptyTierSeasonCounts();
    let careerPab = 0;
    for (const entry of seasons.values()) {
      careerPab += entry.pab;
      Object.assign(tierCounts, incrementTierCount(tierCounts, entry.tier));
    }

    profiles.push({
      playerId: career.player_id,
      draftYear: career.draft_year,
      draftPick: career.draft_pick_overall,
      position: career.draft_position,
      tierCounts,
      careerPab,
    });
  }

  return profiles;
}

export function profileExpectedPab(
  profile: RookieCareerProfile,
  ratesByPosition: Map<Position, TierPabRates>,
): number {
  return careerPabFromTierCounts(
    profile.tierCounts,
    ratesByPosition.get(profile.position)!,
  );
}
