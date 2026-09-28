import type { MemoryOnlyStorage } from "./privy-session.ts";

const KEY = "pirate:privy-wallet-authorization:v1";
const LIFETIME_MS = 60 * 60_000;
const TOKEN_SUFFIXES = ["token", "refresh_token", "pat", "id-token"] as const;

type TabStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Snapshot = Readonly<{
  version: 1;
  appId: string;
  subject: string;
  mode: "single" | "multi";
  savedAt: number;
  entries: readonly (readonly [string, unknown])[];
}>;

function browserStorage(): TabStorage | undefined {
  try { return typeof window === "undefined" ? undefined : window.sessionStorage; }
  catch { return undefined; }
}

/** Read only the Privy DID from a token; Privy still verifies the token. */
export function privyAccessTokenSubject(token: string): string | undefined {
  try {
    const payload = token.split(".")[1];
    if (payload === undefined) return undefined;
    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/");
    const decoded: unknown = JSON.parse(atob(`${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`));
    if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) return undefined;
    // SAFETY: decoded is a non-array object; the subject field is validated below.
    const subject = (decoded as { readonly sub?: unknown }).sub;
    return typeof subject === "string" && /^did:privy:[A-Za-z0-9._:-]+$/u.test(subject) ? subject : undefined;
  } catch { return undefined; }
}

export function clearWalletAuthorization(tab: TabStorage | undefined = browserStorage()): void {
  try { tab?.removeItem(KEY); }
  catch { /* A storage refusal leaves wallet restoration unavailable. */ }
}

/** Save only the SDK's single-user auth keys, after Pirate sign-in succeeds. */
export function rememberWalletAuthorization(
  storage: MemoryOnlyStorage,
  token: string,
  appId: string,
  tab: TabStorage | undefined = browserStorage(),
  now = Date.now(),
): boolean {
  const subject = privyAccessTokenSubject(token);
  if (!tab || !subject) return false;
  const activeUser = storage.get("privy:active-user");
  if (activeUser !== undefined && activeUser !== null && activeUser !== subject) return false;
  const mode = activeUser === subject ? "multi" : "single";
  const prefix = mode === "multi" ? `privy:${subject}:` : "privy:";
  const entries: Array<readonly [string, unknown]> = TOKEN_SUFFIXES
    .map(suffix => [`${prefix}${suffix}`, storage.get(`${prefix}${suffix}`)] as const)
    .filter(([, value]) => value !== undefined);
  if (!entries.some(([key, value]) => key === `${prefix}token` && value === token)) return false;
  if (mode === "multi") {
    entries.push(["privy:active-user", subject]);
    entries.push(["privy:saved-users", JSON.stringify([subject])]);
  }
  try {
    tab.setItem(KEY, JSON.stringify({ version: 1, appId, subject, mode, savedAt: now, entries } satisfies Snapshot));
    return true;
  } catch {
    clearWalletAuthorization(tab);
    return false;
  }
}

/** Restore into a fresh memory-only client; never treat the Pirate cookie as a wallet token. */
export function restoreWalletAuthorization(
  storage: MemoryOnlyStorage,
  appId: string,
  tab: TabStorage | undefined = browserStorage(),
  now = Date.now(),
): Readonly<{ subject: string; expiresAt: number }> | undefined {
  if (!tab) return undefined;
  try {
    const raw = tab.getItem(KEY);
    if (raw === null) return undefined;
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("wallet_snapshot_invalid");
    // SAFETY: value is an object; every field used from it is checked below.
    const snapshot = value as Partial<Snapshot>;
    if (snapshot.version !== 1 || snapshot.appId !== appId ||
      typeof snapshot.subject !== "string" || !/^did:privy:[A-Za-z0-9._:-]+$/u.test(snapshot.subject) ||
      (snapshot.mode !== "single" && snapshot.mode !== "multi") ||
      typeof snapshot.savedAt !== "number" || !Number.isFinite(snapshot.savedAt) ||
      snapshot.savedAt > now || now - snapshot.savedAt >= LIFETIME_MS ||
      !Array.isArray(snapshot.entries) ||
      !snapshot.entries.some(entry => Array.isArray(entry) &&
        entry[0] === (snapshot.mode === "multi" ? `privy:${snapshot.subject}:token` : "privy:token") &&
        typeof entry[1] === "string" && privyAccessTokenSubject(entry[1]) === snapshot.subject)) {
      throw new Error("wallet_snapshot_invalid");
    }
    const prefix = snapshot.mode === "multi" ? `privy:${snapshot.subject}:` : "privy:";
    const allowed = new Set<string>(TOKEN_SUFFIXES.map(suffix => `${prefix}${suffix}`));
    if (snapshot.mode === "multi") {
      allowed.add("privy:active-user"); allowed.add("privy:saved-users");
      if (!snapshot.entries.some(entry => entry[0] === "privy:active-user" && entry[1] === snapshot.subject) ||
        !snapshot.entries.some(entry => entry[0] === "privy:saved-users" && entry[1] === JSON.stringify([snapshot.subject]))) {
        throw new Error("wallet_snapshot_invalid");
      }
    }
    for (const entry of snapshot.entries) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || !allowed.has(entry[0])) {
        throw new Error("wallet_snapshot_invalid");
      }
    }
    for (const [key, item] of snapshot.entries) storage.put(key, item);
    return { subject: snapshot.subject, expiresAt: snapshot.savedAt + LIFETIME_MS };
  } catch {
    clearWalletAuthorization(tab);
    storage.clear();
    return undefined;
  }
}
