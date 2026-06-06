import type { Position } from "@/types/database";

export type DynastyRankingEntry = {
  name: string;
  position: Position;
  /** Overall dynasty rank from FantasyPros ECR. */
  dynastyRank: number;
  /** Position rank (QB1, RB5, etc.) — primary calibration key. */
  positionRank: number;
};

export type DynastyRankingFile = {
  source: string;
  asOf: string;
  players: DynastyRankingEntry[];
};

/** Blend model remaining PAB toward dynasty-implied peer percentile. */
export const DYNASTY_CALIBRATION_WEIGHT = 0.35;

export function dynastyImpliedRemainingPab(
  positionRank: number,
  peerRemaining: number[],
): number {
  if (!peerRemaining.length) return 0;
  const sorted = [...peerRemaining].sort((a, b) => b - a);
  const idx = Math.min(sorted.length - 1, Math.max(0, positionRank - 1));
  return sorted[idx] ?? 0;
}

export function calibrateRemainingPab(
  modelRemaining: number,
  positionRank: number | null,
  peerRemaining: number[],
): number {
  if (!positionRank || !peerRemaining.length) return modelRemaining;
  const dynastyTarget = dynastyImpliedRemainingPab(positionRank, peerRemaining);
  return (
    (1 - DYNASTY_CALIBRATION_WEIGHT) * modelRemaining +
    DYNASTY_CALIBRATION_WEIGHT * dynastyTarget
  );
}

export function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildDynastyLookup(
  file: DynastyRankingFile,
): Map<string, DynastyRankingEntry> {
  const lookup = new Map<string, DynastyRankingEntry>();
  for (const entry of file.players) {
    lookup.set(normalizePlayerName(entry.name), entry);
  }
  return lookup;
}
