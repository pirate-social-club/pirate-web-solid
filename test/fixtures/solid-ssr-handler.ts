export async function handleRequest(
  request: Request,
  options?: Readonly<{ readonly context?: Readonly<{ readonly API_NEXT_ORIGIN?: string }> }>,
): Promise<Response> {
  const url = new URL(request.url);
  return Response.json({
    apiOrigin: options?.context?.API_NEXT_ORIGIN ?? null,
    origin: url.origin,
    path: `${url.pathname}${url.search}`,
  });
}
