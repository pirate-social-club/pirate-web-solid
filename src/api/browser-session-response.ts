import { SessionAuthorityChangedError } from "./browser-session-events.ts";

/** Keep the authority fence alive while the generated client awaits JSON bytes. */
export function fenceBrowserSessionResponse(response: Response, current: () => boolean): Response {
  if (response.body === null) return response;
  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!current()) throw new SessionAuthorityChangedError();
        const next = await reader.read();
        if (!current()) throw new SessionAuthorityChangedError();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      } catch (error) {
        void reader.cancel(error).catch(() => {});
        controller.error(error);
      }
    },
    cancel: reason => reader.cancel(reason),
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}
