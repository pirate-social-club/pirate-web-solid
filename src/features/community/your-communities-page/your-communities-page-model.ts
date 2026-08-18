export interface YourCommunitySummary {
  avatarSrc?: string | null;
  communityId: string;
  displayName: string;
  routeSlug?: string | null;
  updatedAt: string | number;
}

const PUNYCODE_BASE = 36;
const PUNYCODE_T_MIN = 1;
const PUNYCODE_T_MAX = 26;
const PUNYCODE_INITIAL_BIAS = 72;
const PUNYCODE_INITIAL_N = 128;

export function formatCommunityRouteLabel(communityId: string, routeSlug?: string | null): string {
  const routeSegment = formatCommunityRouteSegment(routeSlug || communityId);
  return routeSegment.toLowerCase().startsWith("c/") ? routeSegment : `c/${routeSegment}`;
}

function formatCommunityRouteSegment(value: string): string {
  const trimmedInput = value.trim();
  const trimmed = trimmedInput.toLowerCase().startsWith("c/") ? trimmedInput.slice(2) : trimmedInput;
  if (!trimmed) return "community";
  if (trimmed.startsWith("@")) return `@${decodePunycodeLabel(trimmed.slice(1))}`;
  return decodePunycodeLabel(trimmed);
}

function decodePunycodeLabel(value: string): string {
  if (!value.toLowerCase().startsWith("xn--")) return value;
  try {
    return decodePunycode(value.slice(4));
  } catch {
    return value;
  }
}

function decodePunycode(input: string): string {
  const output: number[] = [];
  let n = PUNYCODE_INITIAL_N;
  let i = 0;
  let bias = PUNYCODE_INITIAL_BIAS;
  const basicEnd = input.lastIndexOf("-");

  if (basicEnd > -1) {
    for (let index = 0; index < basicEnd; index += 1) {
      const codePoint = input.charCodeAt(index);
      if (codePoint >= 0x80) throw new Error("Invalid punycode basic code point");
      output.push(codePoint);
    }
  }

  for (let index = basicEnd > -1 ? basicEnd + 1 : 0; index < input.length;) {
    const oldI = i;
    let weight = 1;
    for (let k = PUNYCODE_BASE;; k += PUNYCODE_BASE) {
      if (index >= input.length) throw new Error("Invalid punycode sequence");
      const digit = decodePunycodeDigit(input.charCodeAt(index));
      index += 1;
      if (digit >= PUNYCODE_BASE) throw new Error("Invalid punycode digit");
      if (digit > Math.floor((Number.MAX_SAFE_INTEGER - i) / weight)) throw new Error("Punycode overflow");
      i += digit * weight;
      const threshold = k <= bias ? PUNYCODE_T_MIN : k >= bias + PUNYCODE_T_MAX ? PUNYCODE_T_MAX : k - bias;
      if (digit < threshold) break;
      if (weight > Math.floor(Number.MAX_SAFE_INTEGER / (PUNYCODE_BASE - threshold))) throw new Error("Punycode overflow");
      weight *= PUNYCODE_BASE - threshold;
    }

    const outputLength = output.length + 1;
    bias = adaptPunycodeBias(i - oldI, outputLength, oldI === 0);
    if (Math.floor(i / outputLength) > Number.MAX_SAFE_INTEGER - n) throw new Error("Punycode overflow");
    n += Math.floor(i / outputLength);
    i %= outputLength;
    output.splice(i, 0, n);
    i += 1;
  }

  return String.fromCodePoint(...output);
}

function decodePunycodeDigit(codePoint: number): number {
  if (codePoint >= 48 && codePoint <= 57) return codePoint - 22;
  if (codePoint >= 65 && codePoint <= 90) return codePoint - 65;
  if (codePoint >= 97 && codePoint <= 122) return codePoint - 97;
  return PUNYCODE_BASE;
}

function adaptPunycodeBias(delta: number, numPoints: number, firstTime: boolean): number {
  const skew = 38;
  const damp = 700;
  let nextDelta = firstTime ? Math.floor(delta / damp) : delta >> 1;
  nextDelta += Math.floor(nextDelta / numPoints);
  let k = 0;
  while (nextDelta > Math.floor(((PUNYCODE_BASE - PUNYCODE_T_MIN) * PUNYCODE_T_MAX) / 2)) {
    nextDelta = Math.floor(nextDelta / (PUNYCODE_BASE - PUNYCODE_T_MIN));
    k += PUNYCODE_BASE;
  }
  return k + Math.floor(((PUNYCODE_BASE - PUNYCODE_T_MIN + 1) * nextDelta) / (nextDelta + skew));
}
