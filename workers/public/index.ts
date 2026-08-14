export default {
  async fetch(request: Request): Promise<Response> {
    return Response.json({
      worker: "pirate-web-solid-public",
      path: new URL(request.url).pathname,
    });
  },
};
