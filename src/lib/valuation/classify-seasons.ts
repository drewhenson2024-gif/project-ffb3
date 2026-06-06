import type { Position } from "@/types/database";
import type { FantasySeasonStats } from "@/types/database";
import { classifyRank, getPositionThresholds } from "./thresholds";
import {
  emptyTierSeasonCounts,
  incrementTierCount,
  seasonPabContribution,
  toValuableTierPab,
  type TierPabRates,
  type TierSeasonCounts,
} from "./career-pab";
import { scoringColumn } from "./scoring";
import type { LeagueConfig, PositionPab, SeasonTier } from "./types";

export type SeasonRow = Pick<
  FantasySeasonStats,
  "player_id" | "season_year" | "position" | "fantasy_points_ppr" | "fantasy_points_half_ppr" | "fantasy_points_standard"
>;

export type ClassifiedPlayerSeason = {
  playerId: number;
  seasonYear: number;
  position: Position;
  tier: SeasonTier | null;
  seasonPab: number;
};

function getPoints(row: SeasonRow, config: LeagueConfig): number {
  const col = scoringColumn(config.scoring);
  return Number(row[col] ?? 0);
}

export function tierPabRatesFromPosition(positionPab: PositionPab): TierPabRates {
  return toValuableTierPab(positionPab.pab);
}

export function classifySeasonsForYear(
  seasons: SeasonRow[],
  year: number,
  config: LeagueConfig,
  ratesByPosition: Map<Position, TierPabRates>,
): ClassifiedPlayerSeason[] {
  const results: ClassifiedPlayerSeason[] = [];

  for (const position of ["QB", "RB", "WR", "TE"] as Position[]) {
    const thresholds = getPositionThresholds(config, position);
    const rates = ratesByPosition.get(position)!;
    const yearRows = seasons
      .filter((s) => s.season_year === year && s.position === position)
      .sort((a, b) => getPoints(b, config) - getPoints(a, config));

    yearRows.forEach((row, index) => {
      const tier = classifyRank(index + 1, thresholds);
      results.push({
        playerId: row.player_id,
        seasonYear: year,
        position,
        tier,
        seasonPab: seasonPabContribution(tier, rates),
      });
    });
  }

  return results;
}

export function summarizePlayerTierCounts(
  classified: ClassifiedPlayerSeason[],
  playerId: number,
): TierSeasonCounts {
  return classified
    .filter((c) => c.playerId === playerId)
    .reduce(
      (counts, row) => incrementTierCount(counts, row.tier),
      emptyTierSeasonCounts(),
    );
}

export function playerCareerPab(
  classified: ClassifiedPlayerSeason[],
  playerId: number,
): number {
  return classified
    .filter((c) => c.playerId === playerId)
    .reduce((sum, row) => sum + row.seasonPab, 0);
}
