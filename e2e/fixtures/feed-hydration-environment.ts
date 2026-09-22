export function requireFeedHydrationFixture(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const value = env.E2E_FEED_COMMUNITY_PATH_SEGMENT?.trim();
  if (!value || !/^[a-z0-9][a-z0-9_-]*$/u.test(value)) {
    throw new Error("Required hydration acceptance needs E2E_FEED_COMMUNITY_PATH_SEGMENT naming a maintained community with a populated public feed.");
  }
  return value;
}
