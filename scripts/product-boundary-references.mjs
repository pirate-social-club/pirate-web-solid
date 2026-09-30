const forbiddenReferences = [
  /@pirate\/web-platform/u,
  /(?:^|[\\/])web[\\/]solid(?:[\\/]|$)/u,
  // Match the retired hostname without rejecting the approved HNS API host.
  /(?<![A-Za-z0-9.-])api-staging\.pirate\.sc(?![A-Za-z0-9.-])/u,
];

export function hasForbiddenProductReference(text) {
  return forbiddenReferences.some(pattern => pattern.test(text));
}
