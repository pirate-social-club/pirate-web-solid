import { expect, test, vi } from "vitest";
import { renderToString } from "@solidjs/web";
import { DanceReferencePage } from "./dance-reference-page";
test("reference authoring SSR reads no account, target, journal or media and emits no private scope", () => {
  const api = { target: vi.fn(), create: vi.fn(), status: vi.fn() }, session = vi.fn();
  const store = { read: vi.fn(), write: vi.fn(), remove: vi.fn(), exclusive: vi.fn() };
  const html = renderToString(() => <DanceReferencePage referencePostId="unresolved-reference" api={api} store={store} session={session} />);
  expect(html).toContain("Checking your video"); expect(html).not.toMatch(/unresolved-reference|profile|video src|choreography|nonce/u);
  expect(session).not.toHaveBeenCalled(); expect(api.target).not.toHaveBeenCalled(); expect(api.create).not.toHaveBeenCalled(); expect(api.status).not.toHaveBeenCalled(); expect(store.read).not.toHaveBeenCalled();
});
