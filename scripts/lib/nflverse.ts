export const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
export type SkillPosition = (typeof POSITIONS)[number];

export const SEASON_START = 2000;
export const SEASON_END = 2025;

export const NFLVERSE_BASE =
  "https://github.com/nflverse/nflverse-data/releases/download";

export function draftPicksUrl(): string {
  return `${NFLVERSE_BASE}/draft_picks/draft_picks.csv`;
}

export function seasonStatsUrl(season: number): string {
  return `${NFLVERSE_BASE}/stats_player/stats_player_reg_${season}.csv`;
}

export function isSkillPosition(value: string): value is SkillPosition {
  return (POSITIONS as readonly string[]).includes(value);
}

export function resolveExternalId(
  gsisId: string | undefined,
  pfrId: string | undefined,
): string | null {
  const id = gsisId?.trim();
  if (id) return id;
  if (pfrId?.trim()) return `pfr:${pfrId.trim()}`;
  return null;
}

export function halfPprPoints(standard: number, receptions: number): number {
  return Math.round((standard + receptions * 0.5) * 100) / 100;
}
