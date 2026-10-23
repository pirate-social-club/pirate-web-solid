import { expect, test, vi } from "vitest";
import { renderToString } from "@solidjs/web";
import { DanceOwnerPage } from "./dance-owner-page";
test.each([undefined, "private-review"])("owner SSR exposes only an unresolved shell (%s)", reviewId => {
  const api = { queue: vi.fn(), detail: vi.fn(), verdict: vi.fn(), media: vi.fn() }, session = vi.fn();
  const store = { read: vi.fn(), write: vi.fn(), remove: vi.fn(), exclusive: vi.fn() };
  const html = renderToString(() => <DanceOwnerPage communityId="private-community" reviewId={reviewId} api={api} store={store} session={session} />);
  expect(html).toContain("Checking review access"); expect(html).not.toMatch(/private-community|private-review|media\/|rubric|Pass/u);
  expect(session).not.toHaveBeenCalled(); expect(api.queue).not.toHaveBeenCalled(); expect(api.detail).not.toHaveBeenCalled(); expect(api.verdict).not.toHaveBeenCalled(); expect(api.media).not.toHaveBeenCalled(); expect(store.read).not.toHaveBeenCalled();
});
