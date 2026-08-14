import type { APIEvent } from "filesystem-routing/api";

export function GET(event: APIEvent) {
  return Response.json({
    ok: true,
    route: "health",
    path: new URL(event.request.url).pathname,
  });
}
