const SUFFIX_PATTERN = /\s+(Jr\.?|Sr\.?|II|III|IV|V)$/i;

const SUFFIX_DISPLAY: Record<string, string> = {
  JR: "Jr.",
  SR: "Sr.",
  II: "II",
  III: "III",
  IV: "IV",
  V: "V",
};

export type NormalizedName = {
  fullName: string;
  displayName: string;
  nameKey: string;
  suffix: string | null;
};

export function normalizePlayerName(raw: string): NormalizedName {
  const displayName = raw.trim().replace(/\s+/g, " ");
  let baseName = displayName;
  let suffix: string | null = null;

  const match = displayName.match(SUFFIX_PATTERN);
  if (match) {
    const token = match[1].replace(/\./g, "").toUpperCase();
    suffix = SUFFIX_DISPLAY[token] ?? match[1];
    baseName = displayName.slice(0, match.index).trim();
  }

  const fullName = baseName
    .split(" ")
    .map((part) =>
      part.length <= 2 && part.endsWith(".")
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join(" ");

  const nameKey = baseName.toLowerCase().replace(/[^a-z0-9]/g, "");

  return { fullName, displayName, nameKey, suffix };
}

export function disambiguatedLabel(
  fullName: string,
  draftYear: number | null,
  debutSeason: number | null,
): string {
  const anchor = draftYear ?? debutSeason;
  return anchor ? `${fullName} (${anchor})` : fullName;
}
