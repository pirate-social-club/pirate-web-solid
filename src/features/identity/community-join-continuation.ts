function key(accountId: string, communityId: string) { return `pirate:joined-name:v1:${encodeURIComponent(accountId)}:${encodeURIComponent(communityId)}`; }

/** A single explicit verified join may continue across its return navigation. */
export function rememberJoinedNameContinuation(accountId: string, communityId: string): void {
  sessionStorage.setItem(key(accountId, communityId), String(Date.now()));
}
export function consumeJoinedNameContinuation(accountId: string, communityId: string): boolean {
  const entry = key(accountId, communityId);
  const value = sessionStorage.getItem(entry);
  sessionStorage.removeItem(entry);
  if (value === null || !/^\d+$/u.test(value)) return false;
  const age = Date.now() - Number(value);
  return age >= 0 && age < 10 * 60_000;
}
