import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DynastyRankingFile } from "./dynasty-calibration";

const DEFAULT_PATH = path.join(process.cwd(), "data", "dynasty-rankings.json");

export async function loadDynastyRankings(
  filePath = DEFAULT_PATH,
): Promise<DynastyRankingFile | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as DynastyRankingFile;
  } catch {
    return null;
  }
}
