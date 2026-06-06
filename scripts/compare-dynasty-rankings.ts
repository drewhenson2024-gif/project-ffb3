/**
 * Compare projected remaining PAB vs dynasty position ranks.
 * Run: npm run compare:dynasty
 */
import { config } from "dotenv";
import path from "node:path";
import { createServerClient } from "../src/lib/supabase/server";
import { normalizePlayerName } from "../src/lib/valuation/dynasty-calibration";
import { loadDynastyRankings } from "../src/lib/valuation/load-dynasty-rankings";
import { runCareerProjections } from "../src/lib/valuation/run-career-projections";
import { DEFAULT_LEAGUE_CONFIG } from "../src/lib/valuation/types";

config({ path: path.resolve(process.cwd(), ".env.local") });

const PAGE = 1000;

async function loadAllProfiles(supabase: ReturnType<typeof createServerClient>) {
  const rows: { player_id: number; full_name: string; primary_position: string }[] =
    [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("player_profiles")
      .select("player_id, full_name, primary_position")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as typeof rows));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function main() {
  const supabase = createServerClient();
  const dynasty = await loadDynastyRankings();
  if (!dynasty) {
    console.error("Missing data/dynasty-rankings.json");
    process.exit(1);
  }

  const [{ projections }, profiles] = await Promise.all([
    runCareerProjections(supabase, DEFAULT_LEAGUE_CONFIG),
    loadAllProfiles(supabase),
  ]);

  const idByName = new Map(
    profiles.map((row) => [normalizePlayerName(row.full_name), row.player_id]),
  );

  console.log(`Dynasty source: ${dynasty.source} (${dynasty.asOf})\n`);
  console.log(
    "Player               | Pos rank | Proj remaining PAB | Quartile",
  );
  console.log("-".repeat(62));

  for (const entry of dynasty.players) {
    const playerId = idByName.get(normalizePlayerName(entry.name));
    const rankLabel = `${entry.position}${entry.positionRank}`;

    if (!playerId) {
      console.log(
        `${entry.name.padEnd(20)} | ${rankLabel.padEnd(8)} | — (name not matched)`,
      );
      continue;
    }

    const projection = projections.get(playerId);
    if (!projection) {
      console.log(
        `${entry.name.padEnd(20)} | ${rankLabel.padEnd(8)} | — (no active projection)`,
      );
      continue;
    }

    console.log(
      `${entry.name.padEnd(20)} | ${rankLabel.padEnd(8)} | ${projection.projectedRemainingPab.toFixed(0).padStart(8)} | Q${projection.careerQuartile}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
