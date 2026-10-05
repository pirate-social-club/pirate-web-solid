const optionalCommunityId =
  /^community_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const hnsRoot = /^[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?$/u;
const spacesRoot = /^[a-z0-9-]+$/u;
const spacesPayload = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const hnsReservedRoots = new Set(["example", "invalid", "local", "localhost", "pirate", "test"]);
const utf8 = new TextEncoder();

/** Structural preflight only; api-next remains authoritative for ACE semantics. */
export function normalizeCommunityPathSegment(value: unknown): string | null {
  if (typeof value !== "string" || value === "" || value !== value.trim()) return null;
  if ([...value].some(character => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f || code > 0x7f;
  })) return null;
  if (value.includes("%") || value.includes("/") || value.includes("\\")) return null;
  if (optionalCommunityId.test(value)) return value;
  if (value.startsWith("@")) {
    const root = value.slice(1);
    const payload = root.startsWith("xn--") && root.length > 4 ? root.slice(4) : root;
    return utf8.encode(root).byteLength <= 62 && spacesRoot.test(root) && spacesPayload.test(payload)
      ? value
      : null;
  }
  return utf8.encode(value).byteLength <= 63 && hnsRoot.test(value) && !hnsReservedRoots.has(value)
    ? value
    : null;
}

