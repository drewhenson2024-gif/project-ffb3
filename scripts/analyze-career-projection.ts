/**
 * Exploratory analysis for career PAB projection + rookie draft pick valuation.
 * Run: npm run analyze:projection
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import path from "node:path";
import {
  careerPabFromTierCounts,
  emptyTierSeasonCounts,
  incrementTierCount,
  seasonPabContribution,
  toValuableTierPab,
  type TierSeasonCounts,
} from "../src/lib/valuation/career-pab";
import {
  cohortExpectedValue,
  meanTierCounts,
  tierHitProbabilities,
} from "../src/lib/valuation/expected-value";
import { computeValuation } from "../src/lib/valuation/pab";
import { classifyRank, getPositionThresholds } from "../src/lib/valuation/thresholds";
import { scoringColumn } from "../src/lib/valuation/scoring";
import {
  DEFAULT_LEAGUE_CONFIG,
  type LeagueConfig,
  type SeasonTier,
} from "../src/lib/valuation/types";
import type { Position } from "../src/types/database";

config({ path: path.resolve(process.cwd(), ".env.local") });

const PAGE_SIZE = 1000;
const CURRENT_SEASON = 2025;
const GAP_YEARS = 2;
const LEAGUE = DEFAULT_LEAGUE_CONFIG;
const POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

type SeasonRow = {
  player_id: number;
  season_year: number;
  position: Position;
  fantasy_points_ppr: number;
  fantasy_points_half_ppr: number;
  fantasy_points_standard: number;
  games_played: number;
  games_started: number;
};

type CareerRow = {
  player_id: number;
  draft_year: number | null;
  draft_round: number | null;
  draft_pick_overall: number | null;
  draft_position: Position | null;
  first_season: number | null;
  last_season: number | null;
  seasons_played: number;
  games_played: number;
};

type TierCounts = TierSeasonCounts & { bench: number };

type CheckpointRow = {
  playerId: number;
  position: Position;
  checkpointSeason: number;
  yearsPlayed: number;
  ageProxy: number | null;
  draftPick: number | null;
  draftRound: number | null;
  draftYear: number | null;
  cumulativePab: number;
  avgPabPerSeason: number;
  remainingPab: number;
  remainingTiers: TierSeasonCounts;
  totalCareerPab: number;
  tiers: TierCounts;
  gamesPlayed: number;
  gamesPerSeason: number;
  peakTier: number;
};

async function fetchAll<T>(
  supabase: ReturnType<typeof createClient>,
  table: string,
  select: string,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

function section(title: string) {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
}

function getPoints(row: SeasonRow, config: LeagueConfig): number {
  return Number(row[scoringColumn(config.scoring)] ?? 0);
}

function computeSeasonPabByPlayer(
  seasons: SeasonRow[],
  config: LeagueConfig,
): Map<
  number,
  Map<
    number,
    { pab: number; tier: SeasonTier | null; position: Position; games: number }
  >
> {
  const years = [...new Set(seasons.map((s) => s.season_year))].sort((a, b) => b - a);
  const valuationYears = years.slice(0, 6);
  const valuation = computeValuation(config, seasons, valuationYears);
  const ratesByPosition = new Map(
    valuation.positions.map((p) => [p.position, toValuableTierPab(p.pab)]),
  );

  const result = new Map<
    number,
    Map<
      number,
      { pab: number; tier: SeasonTier | null; position: Position; games: number }
    >
  >();

  for (const year of years) {
    for (const position of POSITIONS) {
      const thresholds = getPositionThresholds(config, position);
      const rates = ratesByPosition.get(position)!;
      const yearRows = seasons
        .filter((s) => s.season_year === year && s.position === position)
        .sort((a, b) => getPoints(b, config) - getPoints(a, config));

      yearRows.forEach((row, index) => {
        const tier = classifyRank(index + 1, thresholds);
        const pab = seasonPabContribution(tier, rates);

        if (!result.has(row.player_id)) result.set(row.player_id, new Map());
        result.get(row.player_id)!.set(year, {
          pab,
          tier,
          position: row.position,
          games: row.games_played,
        });
      });
    }
  }

  return result;
}

function tierOrdinal(tier: SeasonTier | null): number {
  if (tier === "elite") return 4;
  if (tier === "star") return 3;
  if (tier === "starter") return 2;
  if (tier === "bench") return 1;
  return 0;
}

function isCareerComplete(
  lastSeason: number | null,
  hasRecentStats: boolean,
  rule: "gap" | "final_lag" | "combined",
): boolean {
  if (lastSeason === null) return false;
  if (rule === "gap") return !hasRecentStats;
  if (rule === "final_lag") return lastSeason <= CURRENT_SEASON - GAP_YEARS;
  return !hasRecentStats || lastSeason <= CURRENT_SEASON - GAP_YEARS;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function std(values: number[]): number {
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

function rSquared(actual: number[], predicted: number[]): number {
  const yMean = mean(actual);
  const ssTot = actual.reduce((s, y) => s + (y - yMean) ** 2, 0);
  const ssRes = actual.reduce((s, y, i) => s + (y - predicted[i]) ** 2, 0);
  return ssTot > 0 ? 1 - ssRes / ssTot : 0;
}

function ols(
  X: number[][],
  y: number[],
): { coefficients: number[]; r2: number } {
  const n = y.length;
  const k = X[0]?.length ?? 0;
  if (n < k + 5) return { coefficients: [], r2: 0 };

  const design = X.map((row) => [1, ...row]);
  const kFull = k + 1;
  const xtx = Array.from({ length: kFull }, () => Array(kFull).fill(0));
  const xty = Array(kFull).fill(0);

  for (let i = 0; i < n; i++) {
    for (let a = 0; a < kFull; a++) {
      xty[a] += design[i][a] * y[i];
      for (let b = 0; b < kFull; b++) {
        xtx[a][b] += design[i][a] * design[i][b];
      }
    }
  }

  const beta = solveLinear(xtx, xty);
  const predictions = design.map((row) =>
    row.reduce((s, v, j) => s + v * beta[j], 0),
  );
  return { coefficients: beta, r2: rSquared(y, predictions) };
}

function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) pivot = row;
    }
    [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
    const div = aug[col][col] || 1e-9;
    for (let j = col; j <= n; j++) aug[col][j] /= div;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = col; j <= n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }

  return aug.map((row) => row[n]);
}

function zScore(values: number[]): number[] {
  const m = mean(values);
  const s = std(values) || 1;
  return values.map((v) => (v - m) / s);
}

function buildCheckpoints(
  seasonPab: Map<
    number,
    Map<
      number,
      { pab: number; tier: SeasonTier | null; position: Position; games: number }
    >
  >,
  careers: CareerRow[],
  completeIds: Set<number>,
): CheckpointRow[] {
  const careerById = new Map(careers.map((c) => [c.player_id, c]));
  const rows: CheckpointRow[] = [];

  for (const playerId of completeIds) {
    const seasons = seasonPab.get(playerId);
    const career = careerById.get(playerId);
    if (!seasons || !career?.first_season || !career.last_season) continue;
    if (!career.draft_pick_overall || !career.draft_year || career.draft_year < 2000) {
      continue;
    }

    const sortedYears = [...seasons.keys()].sort((a, b) => a - b);
    const totalCareerPab = sortedYears.reduce((s, y) => s + (seasons.get(y)?.pab ?? 0), 0);
    const totalTiers = emptyTierSeasonCounts();
    for (const entry of seasons.values()) {
      if (entry.tier && entry.tier !== "bench") {
        totalTiers[entry.tier] += 1;
      }
    }
    const position = seasons.get(sortedYears[0])?.position ?? career.draft_position ?? "WR";

    let cumulative = 0;
    let games = 0;
    const tiers: TierCounts = { elite: 0, star: 0, starter: 0, bench: 0 } as TierCounts;
    let peakTier = 0;

    for (let i = 0; i < sortedYears.length; i++) {
      const year = sortedYears[i];
      const entry = seasons.get(year)!;
      cumulative += entry.pab;
      if (entry.tier === "bench") tiers.bench += 1;
      else if (entry.tier) tiers[entry.tier] += 1;
      peakTier = Math.max(peakTier, tierOrdinal(entry.tier));
      games += entry.games;

      const remainingTiers: TierSeasonCounts = {
        elite: totalTiers.elite - tiers.elite,
        star: totalTiers.star - tiers.star,
        starter: totalTiers.starter - tiers.starter,
      };

      rows.push({
        playerId,
        position,
        checkpointSeason: year,
        yearsPlayed: i + 1,
        ageProxy: year - career.draft_year + 22,
        draftPick: career.draft_pick_overall,
        draftRound: career.draft_round,
        draftYear: career.draft_year,
        cumulativePab: cumulative,
        avgPabPerSeason: cumulative / (i + 1),
        remainingPab: totalCareerPab - cumulative,
        remainingTiers,
        totalCareerPab,
        tiers: { ...tiers },
        gamesPlayed: games,
        gamesPerSeason: games / (i + 1),
        peakTier,
      });
    }
  }

  return rows;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");

  const supabase = createClient(url, key);

  section("Analysis setup");
  console.log(`League: ${LEAGUE.teams} teams, PPR, default starters/bench`);
  console.log(`Current season: ${CURRENT_SEASON}`);
  console.log("Note: Team wins are NOT in our schema — using games_played instead.");

  const [seasons, careers] = await Promise.all([
    fetchAll<SeasonRow>(
      supabase,
      "fantasy_season_stats",
      "player_id, season_year, position, fantasy_points_ppr, fantasy_points_half_ppr, fantasy_points_standard, games_played, games_started",
    ),
    fetchAll<CareerRow>(
      supabase,
      "player_career_stats",
      "player_id, draft_year, draft_round, draft_pick_overall, draft_position, first_season, last_season, seasons_played, games_played",
    ),
  ]);

  const seasonPab = computeSeasonPabByPlayer(seasons, LEAGUE);
  const careerById = new Map(careers.map((c) => [c.player_id, c]));

  section("Career-complete rule comparison");
  const recentYears = new Set([CURRENT_SEASON, CURRENT_SEASON - 1]);
  const playersWithRecent = new Set<number>();
  for (const s of seasons) {
    if (recentYears.has(s.season_year)) playersWithRecent.add(s.player_id);
  }

  for (const rule of ["gap", "final_lag", "combined"] as const) {
    const complete = careers.filter((c) => {
      const hasRecent = playersWithRecent.has(c.player_id);
      return isCareerComplete(c.last_season, hasRecent, rule);
    });
    const withDraft = complete.filter(
      (c) => c.draft_pick_overall && c.draft_year && c.draft_year >= 2000,
    );
    console.log(
      `${rule.padEnd(12)} complete=${complete.length}  drafted_2000+=${withDraft.length}`,
    );
  }

  const completeIds = new Set(
    careers
      .filter((c) => {
        const hasRecent = playersWithRecent.has(c.player_id);
        return isCareerComplete(c.last_season, hasRecent, "combined");
      })
      .map((c) => c.player_id),
  );

  const injuryGap = [...completeIds].filter((id) => {
    const c = careerById.get(id)!;
    return c.last_season === CURRENT_SEASON - GAP_YEARS - 1;
  });
  console.log(
    `\nPlayers last active in ${CURRENT_SEASON - GAP_YEARS - 1} (possible injury/retire): ${injuryGap.length}`,
  );
  console.log("Use COMBINED: no stats in last 2 seasons OR final_season <= 2023.");

  const regRows = buildCheckpoints(seasonPab, careers, completeIds);

  section("Regression: predicting REMAINING career PAB");
  console.log(`Checkpoint samples: ${regRows.length}`);

  const y = regRows.map((r) => r.remainingPab);

  const univariate = [
    ["log(draft_pick)", zScore(regRows.map((r) => Math.log(r.draftPick!)))],
    ["years_played", zScore(regRows.map((r) => r.yearsPlayed))],
    ["cumulative_pab", zScore(regRows.map((r) => r.cumulativePab))],
    ["elite_seasons", zScore(regRows.map((r) => r.tiers.elite))],
    ["star_seasons", zScore(regRows.map((r) => r.tiers.star))],
    ["starter_seasons", zScore(regRows.map((r) => r.tiers.starter))],
    ["bench_seasons", zScore(regRows.map((r) => r.tiers.bench))],
    ["peak_tier", zScore(regRows.map((r) => r.peakTier))],
    ["games_played", zScore(regRows.map((r) => r.gamesPlayed))],
    ["age_proxy", zScore(regRows.map((r) => r.ageProxy ?? 0))],
  ] as const;

  console.log("\nUnivariate R² vs remaining career PAB:");
  for (const [name, x] of univariate) {
    const { r2 } = ols([x], y);
    console.log(`  ${name.padEnd(22)} R² = ${r2.toFixed(3)}`);
  }

  const cols = univariate.map(([, x]) => x);
  const multi = ols(
    regRows.map((_, i) => cols.map((col) => col[i])),
    y,
  );
  console.log(`\nMultivariate R² = ${multi.r2.toFixed(3)}`);
  console.log("Coefficients (standardized features + intercept):");
  console.log(`  intercept            ${multi.coefficients[0]?.toFixed(4)}`);
  for (let i = 0; i < univariate.length; i++) {
    console.log(
      `  ${univariate[i][0].padEnd(20)} ${multi.coefficients[i + 1]?.toFixed(4)}`,
    );
  }

  section("Position-specific regression: REMAINING tier seasons (target for projection)");
  const featureNames = [
    "log_draft_pick",
    "years_played",
    "elite_so_far",
    "star_so_far",
    "starter_so_far",
    "peak_tier",
    "games_played",
    "age_proxy",
  ] as const;

  for (const pos of POSITIONS) {
    const subset = regRows.filter((r) => r.position === pos);
    if (subset.length < 100) continue;

    console.log(`\n${pos} (n=${subset.length} checkpoints):`);
    for (const target of ["elite", "star", "starter"] as const) {
      const yTier = subset.map((r) => r.remainingTiers[target]);
      const X = subset.map((r) => [
        zScore(subset.map((s) => Math.log(s.draftPick!)))[subset.indexOf(r)],
        zScore(subset.map((s) => s.yearsPlayed))[subset.indexOf(r)],
        zScore(subset.map((s) => s.tiers.elite))[subset.indexOf(r)],
        zScore(subset.map((s) => s.tiers.star))[subset.indexOf(r)],
        zScore(subset.map((s) => s.tiers.starter))[subset.indexOf(r)],
        zScore(subset.map((s) => s.peakTier))[subset.indexOf(r)],
        zScore(subset.map((s) => s.gamesPlayed))[subset.indexOf(r)],
        zScore(subset.map((s) => s.ageProxy ?? 0))[subset.indexOf(r)],
      ]);
      const fit = ols(X, yTier);
      const coefs = featureNames
        .map((name, i) => `${name}=${fit.coefficients[i + 1]?.toFixed(3)}`)
        .join(", ");
      console.log(
        `  remaining_${target.padEnd(7)} R²=${fit.r2.toFixed(3)}  ${coefs}`,
      );
    }
  }

  section("Draft-pick weight decay by years played");
  console.log("years | n   | R²(draft only) | R²(draft+perf) | draft weight");

  const draftWeights: { years: number; weight: number }[] = [];

  for (let yp = 1; yp <= 8; yp++) {
    const subset = regRows.filter((r) => r.yearsPlayed === yp);
    if (subset.length < 25) continue;

    const yy = subset.map((r) => r.remainingPab);
    const dp = zScore(subset.map((r) => Math.log(r.draftPick!)));
    const cum = zScore(subset.map((r) => r.cumulativePab));
    const elite = zScore(subset.map((r) => r.tiers.elite));
    const star = zScore(subset.map((r) => r.tiers.star));
    const peak = zScore(subset.map((r) => r.peakTier));

    const draftOnly = ols([dp], yy);
    const combined = ols(
      subset.map((_, i) => [dp[i], cum[i], elite[i], star[i], peak[i]]),
      yy,
    );

    const draftR2 = Math.max(0, draftOnly.r2);
    const combinedR2 = Math.max(0, combined.r2);
    const perfR2 = Math.max(0, combinedR2 - draftR2);
    const weight = draftR2 / (draftR2 + perfR2 + 1e-9);

    draftWeights.push({ years: yp, weight });
    console.log(
      `  ${String(yp).padStart(4)} | ${String(subset.length).padStart(3)} | ${draftR2.toFixed(3).padStart(14)} | ${combinedR2.toFixed(3).padStart(14)} | ${weight.toFixed(2)}`,
    );
  }

  let bestK = 0.4;
  let bestErr = Infinity;
  for (let k = 0.05; k <= 1.2; k += 0.05) {
    const err = draftWeights.reduce((s, d) => {
      const pred = 1 / (1 + k * d.years);
      return s + (pred - d.weight) ** 2;
    }, 0);
    if (err < bestErr) {
      bestErr = err;
      bestK = k;
    }
  }

  console.log(`\nFitted decay: draft_weight = 1 / (1 + ${bestK.toFixed(2)} * years_played)`);
  for (const yp of [0, 1, 2, 3, 4, 5, 6, 8]) {
    console.log(`  Year ${yp}: ${(1 / (1 + bestK * Math.max(yp, 0))).toFixed(2)}`);
  }

  section("Expected value by NFL draft pick (P(tier) × tier PAB)");
  const completedDrafted = careers.filter(
    (c) =>
      completeIds.has(c.player_id) &&
      c.draft_pick_overall &&
      c.draft_year &&
      c.draft_year >= 2000 &&
      c.draft_position,
  );

  const valuation = computeValuation(
    LEAGUE,
    seasons,
    [...new Set(seasons.map((s) => s.season_year))].sort((a, b) => b - a).slice(0, 6),
  );
  const ratesByPosition = new Map(
    valuation.positions.map((p) => [p.position, toValuableTierPab(p.pab)]),
  );

  const careerPabTotals = completedDrafted.map((c) => {
    const seasonMap = seasonPab.get(c.player_id);
    let total = 0;
    const tierCounts = emptyTierSeasonCounts();
    if (seasonMap) {
      for (const entry of seasonMap.values()) {
        total += entry.pab;
        Object.assign(tierCounts, incrementTierCount(tierCounts, entry.tier));
      }
    }
    return { ...c, totalPab: total, tierCounts };
  });

  const buckets = [
    { label: "1-12", lo: 1, hi: 12 },
    { label: "13-24", lo: 13, hi: 24 },
    { label: "25-48", lo: 25, hi: 48 },
    { label: "49-64", lo: 49, hi: 64 },
    { label: "65-100", lo: 65, hi: 100 },
    { label: "101+", lo: 101, hi: 300 },
  ];

  console.log(
    "bucket   | n   | E[PAB] | median | P(elite) | P(star) | P(starter) | E elite | E star | E starter",
  );
  for (const b of buckets) {
    const cohort = careerPabTotals.filter(
      (c) => c.draft_pick_overall! >= b.lo && c.draft_pick_overall! <= b.hi,
    );
    if (cohort.length < 5) continue;

    const tierCounts = cohort.map((c) => c.tierCounts);
    const expectedCounts = meanTierCounts(tierCounts);
    const hitProb = tierHitProbabilities(tierCounts);
    const expectedPab = mean(
      cohort.map((c) =>
        careerPabFromTierCounts(
          c.tierCounts,
          ratesByPosition.get(c.draft_position!)!,
        ),
      ),
    );
    const vals = cohort.map((c) => c.totalPab);

    console.log(
      `${b.label.padEnd(8)} | ${String(cohort.length).padStart(3)} | ${expectedPab.toFixed(1).padStart(6)} | ${median(vals).toFixed(1).padStart(6)} | ${(hitProb.elite * 100).toFixed(0).padStart(7)}% | ${(hitProb.star * 100).toFixed(0).padStart(6)}% | ${(hitProb.starter * 100).toFixed(0).padStart(9)}% | ${expectedCounts.elite.toFixed(2).padStart(7)} | ${expectedCounts.star.toFixed(2).padStart(6)} | ${expectedCounts.starter.toFixed(2).padStart(9)}`,
    );
  }
  console.log(
    "\nE[PAB] = E[elite seasons]×elite_PAB + E[star]×star_PAB + E[starter]×starter_PAB.",
  );
  console.log(
    "Median can be 0 when >50% bust; expected value stays >0 when some hit premium tiers.",
  );

  section("Rookie dynasty pick values (cross-position rank, no adjustments)");
  const pickSlotValues = new Map<number, number[]>();

  for (let draftYear = 2000; draftYear <= 2019; draftYear++) {
    const classPlayers = careerPabTotals.filter((c) => c.draft_year === draftYear);
    if (classPlayers.length < 20) continue;

    const ranked = [...classPlayers].sort((a, b) => b.totalPab - a.totalPab);
    ranked.forEach((p, index) => {
      const slot = index + 1;
      if (!pickSlotValues.has(slot)) pickSlotValues.set(slot, []);
      pickSlotValues.get(slot)!.push(p.totalPab);
    });
  }

  console.log("Pick slot | E[PAB] (mean) | median | classes");
  for (let slot = 1; slot <= 36; slot++) {
    const vals = pickSlotValues.get(slot) ?? [];
    if (vals.length < 3) continue;
    console.log(
      `  ${String(slot).padStart(4)}    | ${mean(vals).toFixed(1).padStart(13)} | ${median(vals).toFixed(1).padStart(6)} | ${vals.length}`,
    );
  }

  section("Position-specific expected value by NFL pick");
  for (const pos of POSITIONS) {
    const rates = ratesByPosition.get(pos)!;
    console.log(`\n${pos} (elite=${rates.elite.toFixed(0)}, star=${rates.star.toFixed(0)}, starter=${rates.starter.toFixed(0)} PAB/season):`);
    for (const b of buckets.slice(0, 5)) {
      const cohort = careerPabTotals.filter(
        (c) =>
          c.draft_position === pos &&
          c.draft_pick_overall! >= b.lo &&
          c.draft_pick_overall! <= b.hi,
      );
      if (cohort.length < 3) continue;
      const ev = cohortExpectedValue(
        cohort.map((c) => c.tierCounts),
        rates,
      );
      console.log(
        `  picks ${b.label}: n=${cohort.length}, E[PAB]=${ev.expectedCareerPab.toFixed(1)}, P(elite)=${(ev.hitProbabilities.elite * 100).toFixed(0)}%, E[elite]=${ev.expectedCounts.elite.toFixed(2)} seasons`,
      );
    }
  }

  section("Decisions summary");
  console.log(`
Career complete: COMBINED rule (${completeIds.size} players)
Draft weight decay: 1 / (1 + ${bestK.toFixed(2)} * years_played)
Top predictors: cumulative_pab, elite/star seasons, games_played, draft_pick (early)
Aggregate baseline: EXPECTED VALUE (mean tier seasons × tier PAB rates)
Dynasty rookie pick K: expected career PAB of Kth-ranked player (mean across classes)
League settings: recompute all PAB when user submits config (teams, starters, scoring)
Missing: team wins — add later from nflverse schedules if needed
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
