function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname.startsWith("127.");
}

/**
 * Resolve the API origin from the public host surface. Keep this function
 * framework-neutral so it can be shared by route loaders and client code.
 */
export function resolveApiOriginFromHostname(hostname: string): string {
  const normalizedHostname = hostname.trim().toLowerCase();
  if (isLocalHost(normalizedHostname) || normalizedHostname.endsWith(".localhost")) {
    return "http://127.0.0.1:8787";
  }
  if (
    normalizedHostname === "staging.pirate.sc" ||
    normalizedHostname.endsWith(".staging.pirate.sc")
  ) {
    return "https://api-staging.pirate.sc";
  }
  return "https://api.pirate.sc";
}
