export const CURRENT_SEASON = 2025;
export const CAREER_GAP_YEARS = 2;

export function isCareerComplete(
  lastSeason: number | null,
  hasRecentStats: boolean,
): boolean {
  if (lastSeason === null) return false;
  return (
    !hasRecentStats || lastSeason <= CURRENT_SEASON - CAREER_GAP_YEARS
  );
}

export function recentSeasonYears(): number[] {
  return [CURRENT_SEASON, CURRENT_SEASON - 1];
}

/** First-year players with no prior NFL seasons — excluded from projection. */
export function isCurrentRookie(
  seasonsPlayed: number,
  firstSeason: number | null,
  lastSeason: number | null,
): boolean {
  if (seasonsPlayed === 0) return true;
  return (
    firstSeason === CURRENT_SEASON &&
    lastSeason === CURRENT_SEASON &&
    seasonsPlayed <= 1
  );
}
