const hnsRoot = /^[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?$/u;

export function transformDirectHnsCommunityRootPath(
  pathname: string,
  hostname: string | undefined,
): string {
  if (pathname !== "/" || hostname === undefined) return pathname;
  const normalizedHost = hostname.toLowerCase();
  if (!normalizedHost.startsWith("app.")) return pathname;
  const root = normalizedHost.slice(4);
  return hnsRoot.test(root) ? `/c/${root}` : pathname;
}
