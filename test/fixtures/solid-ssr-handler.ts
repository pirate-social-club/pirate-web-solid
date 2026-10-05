export async function handleRequest(
  request: Request,
  options?: Readonly<{
    readonly context?: Readonly<{
      readonly API_NEXT_ORIGIN?: string;
      readonly PUBLIC_APP_CANONICAL_ORIGIN?: string;
      readonly COMMUNITY_CREATION_AVATAR_AUTHORING_ENABLED?: string;
      readonly VERIFIED_COMMUNITY_APP_ID?: string;
    }>;
  }>,
): Promise<Response> {
  const url = new URL(request.url);
  const document = {
    apiOrigin: options?.context?.API_NEXT_ORIGIN ?? null,
    canonicalOrigin: options?.context?.PUBLIC_APP_CANONICAL_ORIGIN ?? null,
    origin: url.origin,
    path: `${url.pathname}${url.search}`,
  };
  if (options?.context?.VERIFIED_COMMUNITY_APP_ID !== undefined) return Response.json({ ...document, communityAppId: options.context.VERIFIED_COMMUNITY_APP_ID });
  return Response.json(document);
}
