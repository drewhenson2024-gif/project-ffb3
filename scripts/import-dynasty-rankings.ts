/**
 * Import FantasyPros 2026 dynasty consensus rankings into data/dynasty-rankings.json.
 * Run: npm run import:dynasty
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Position } from "../src/types/database";
import type { DynastyRankingEntry, DynastyRankingFile } from "../src/lib/valuation/dynasty-calibration";

const FP_URL = "https://www.fantasypros.com/nfl/rankings/dynasty-overall.php";
const SKILL_POSITIONS = new Set<Position>(["QB", "RB", "WR", "TE"]);
const OUTPUT = path.join(process.cwd(), "data", "dynasty-rankings.json");

type FpPlayer = {
  player_name: string;
  player_position_id: string;
  rank_ecr: number;
  pos_rank: string;
};

type FpEcrData = {
  sport: string;
  type: string;
  year: string;
  last_updated: string;
  count: number;
  total_experts: number;
  players: FpPlayer[];
};

function extractEcrData(html: string): FpEcrData {
  const marker = "var ecrData = ";
  const start = html.indexOf(marker);
  if (start < 0) throw new Error("ecrData not found in FantasyPros page");

  let i = start + marker.length;
  if (html[i] !== "{") throw new Error("ecrData JSON does not start with {");

  let depth = 0;
  let inString = false;
  let escape = false;

  for (; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const json = html.slice(start + marker.length, i + 1);
        return JSON.parse(json) as FpEcrData;
      }
    }
  }

  throw new Error("Could not parse ecrData JSON");
}

function parsePositionRank(posRank: string): number {
  const match = posRank.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

async function main() {
  const response = await fetch(FP_URL, {
    headers: {
      "User-Agent": "project-ffb3-dynasty-import/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`FantasyPros fetch failed: ${response.status}`);
  }

  const html = await response.text();
  const ecr = extractEcrData(html);

  const players: DynastyRankingEntry[] = ecr.players
    .filter((p) => SKILL_POSITIONS.has(p.player_position_id as Position))
    .map((p) => ({
      name: p.player_name,
      position: p.player_position_id as Position,
      dynastyRank: p.rank_ecr,
      positionRank: parsePositionRank(p.pos_rank),
    }));

  const file: DynastyRankingFile = {
    source: "FantasyPros dynasty overall consensus (ECR)",
    asOf: `2026-${ecr.last_updated.replace("/", "-")}`,
    players,
  };

  await writeFile(OUTPUT, `${JSON.stringify(file, null, 2)}\n`, "utf8");

  const dak = players.find((p) => p.name === "Dak Prescott");
  const mahomes = players.find((p) => p.name === "Patrick Mahomes");

  console.log(`Wrote ${players.length} skill-position players to ${OUTPUT}`);
  console.log(`FantasyPros: ${ecr.count} total ranked · ${ecr.total_experts} experts`);
  if (dak) console.log(`Dak Prescott: overall #${dak.dynastyRank}, ${dak.position}${dak.positionRank}`);
  if (mahomes)
    console.log(
      `Patrick Mahomes: overall #${mahomes.dynastyRank}, ${mahomes.position}${mahomes.positionRank}`,
    );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
