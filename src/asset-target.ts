export function canonicalAssetTarget(clientEntry: string, canonicalAssetOrigin: string | undefined): string {
  return canonicalAssetOrigin === undefined
    ? clientEntry
    : new URL(clientEntry, canonicalAssetOrigin).toString();
}

export function documentClientEntry(
  clientEntry: string | undefined,
  canonicalAssetOrigin: string | undefined,
  hydrate: boolean,
): string | undefined {
  return hydrate && clientEntry !== undefined
    ? canonicalAssetTarget(clientEntry, canonicalAssetOrigin)
    : undefined;
}
