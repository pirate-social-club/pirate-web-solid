/** Shared public timestamps; absent or invalid dates do not produce metadata. */
export function relativeTime(value: string | undefined, now = Date.now()): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  const hours = Math.floor(Math.max(0, now - timestamp) / 3_600_000);
  return hours < 24 ? `${Math.max(1, hours)}h ago` : `${Math.floor(hours / 24)}d ago`;
}
