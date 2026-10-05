/** Shared public timestamps; absent or invalid dates do not produce metadata. */
export function relativeTime(value: string | undefined, now = Date.now()): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  const minutes = Math.floor(Math.max(0, now - timestamp) / 60_000);
  if (minutes === 0) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}
