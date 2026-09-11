const MAX_BODY_BYTES = 65_536;
const safeLiterals = new Set([
  "create_new", "existing", "and", "BadRequest", "Conflict", "InternalError",
  "Invalid body request", "Invalid query request", "Invalid path request",
  "commit", "activate_profile", "blocked", "wait", "none", "quota_exceeded",
  "human-verification", "age-minimum", "nationality-allowed", "gender-marker",
  "erc721-collection", "inventory-match", "asset-ownership", "reputation-score",
]);

export function isCreationCall(url: string): boolean {
  return /^\/(?:api\/)?community-creation-intents(?:\/[^/]+(?:\/commit)?)?$/u.test(new URL(url).pathname);
}

// Preserve field names, JSON types, enum values and string constraints. Never
// retain free text, identity values, credentials, request headers or cookies.
function sanitize(value: unknown, key = "", depth = 0): unknown {
  if (/token|cookie|secret|authorization|password|email|otp/iu.test(key)) return "[redacted]";
  if (depth > 10) return "[depth limit]";
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return { type: "number", integer: Number.isInteger(value),
    ...(["version", "expected_revision", "revision", "minimumAge", "minCount", "minQuantity", "minimumScore"].includes(key)
      ? { value } : { positive: value > 0 }),
  };
  if (typeof value === "string") {
    if (safeLiterals.has(value)) return value;
    return {
      type: "string", length: value.length, trimmedLength: value.trim().length,
      hasControlCharacters: [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127),
    };
  }
  if (Array.isArray(value)) return value.slice(0, 50).map(item => sanitize(item, key, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 50)
    .map(([field, item]) => [field, sanitize(item, field, depth + 1)]));
  return { type: typeof value };
}

export function sanitizeCreationBody(body: string | null): unknown {
  if (body === null) return { absent: true };
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) return { omitted: "body exceeds capture limit" };
  try { return sanitize(JSON.parse(body)); }
  catch { return { invalidJson: true, bytes: Buffer.byteLength(body) }; }
}
