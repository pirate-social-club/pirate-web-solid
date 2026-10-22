import { expect, test, vi } from "vitest";
import { renderToString } from "@solidjs/web";
import { DanceReviewPage } from "./dance-review-page";

test("recording management SSR exposes a shell without session, journal, media or command access", () => {
  const api = { read: vi.fn(), disclosure: vi.fn(), command: vi.fn(), media: vi.fn() }, session = vi.fn();
  const store = { read: vi.fn(), write: vi.fn(), remove: vi.fn(), exclusive: vi.fn() };
  const html = renderToString(() => <DanceReviewPage communityId="private-community" reviewId="private-review" api={api} store={store} session={session} />);
  expect(html).toContain("Checking your recording"); expect(html).not.toMatch(/private-community|private-review|media\/|Show publicly/u);
  expect(session).not.toHaveBeenCalled(); expect(api.read).not.toHaveBeenCalled(); expect(store.read).not.toHaveBeenCalled(); expect(api.media).not.toHaveBeenCalled(); expect(api.command).not.toHaveBeenCalled();
});
