// Nationality badge helpers. The React version resolves country names through
// a curated dataset (src/lib/countries); the Solid port uses Intl.DisplayNames
// directly, which covers the alpha-2 codes these helpers accept.

function getCountryDisplayName(
  countryCode: string,
  locale?: string | null,
): string | null {
  const normalized = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/u.test(normalized)) return null;

  try {
    const displayNames = new Intl.DisplayNames(locale ? [locale] : undefined, { type: "region" });
    return displayNames.of(normalized) ?? null;
  } catch {
    return null;
  }
}

function normalizeQualifierText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function buildNationalityBadgeLabel(countryCode: string, locale?: string | null): string {
  const countryName = getCountryDisplayName(countryCode, locale) ?? countryCode.toUpperCase();
  return `Verified ${countryName} nationality`;
}

export function nationalityMatchesQualifier(input: {
  countryCode: string;
  locale?: string | null;
  qualifierLabels?: string[];
}): boolean {
  const countryCode = input.countryCode.trim().toUpperCase();
  if (!countryCode || !input.qualifierLabels?.length) {
    return false;
  }

  const countryName = getCountryDisplayName(countryCode, input.locale) ?? countryCode;
  const candidates = new Set([
    normalizeQualifierText(`${countryCode} national`),
    normalizeQualifierText(`${countryCode} nationality`),
    normalizeQualifierText(`${countryName} national`),
    normalizeQualifierText(`${countryName} nationality`),
  ]);

  return input.qualifierLabels.some((label) => candidates.has(normalizeQualifierText(label)));
}
