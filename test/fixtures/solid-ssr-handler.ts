export async function handleRequest(
  request: Request,
  options?: Readonly<{
    readonly context?: Readonly<{
      readonly API_NEXT_ORIGIN?: string;
      readonly PUBLIC_APP_CANONICAL_ORIGIN?: string;
    }>;
  }>,
): Promise<Response> {
  const url = new URL(request.url);
  return Response.json({
    apiOrigin: options?.context?.API_NEXT_ORIGIN ?? null,
    canonicalOrigin: options?.context?.PUBLIC_APP_CANONICAL_ORIGIN ?? null,
    origin: url.origin,
    path: `${url.pathname}${url.search}`,
  });
}
