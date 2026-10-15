import { render as solidRender } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import type { GetPublicProfileActivityInput, GetPublicProfileActivityResponse } from "@pirate/api-client";
import { refreshSession } from "../../../api/session.ts";
import { ProfileActivity } from "./profile-activity.tsx";
import { profileActivityFixture } from "./profile-activity-fixtures.ts";

Element.prototype.scrollIntoView = vi.fn();
const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(stop => stop()); window.history.replaceState(null, "", "/"); vi.unstubAllGlobals(); });
function render(ui: () => ReturnType<typeof ProfileActivity>) {
  const element = document.createElement("div"); document.body.appendChild(element);
  createRoot(stop => { solidRender(ui, element); cleanups.push(() => { stop(); element.remove(); }); });
  return element;
}
const empty: GetPublicProfileActivityResponse = { object: "profile_activity_page", items: [], next_cursor: null };
test("waits for session resolution, reads only posts, and uses shared cards without tabs", async () => {
  // A link saved from the tabbed page still lands on the one feed.
  window.history.replaceState(null, "", "/#comments");
  let resolve!: (value: "anonymous") => void;
  const session = new Promise<"anonymous">(done => { resolve = done; });
  const read = vi.fn(async (_input: GetPublicProfileActivityInput) => profileActivityFixture);
  const element = render(() => <ProfileActivity personaId="owned" dependencies={{ resolveSession: () => session, client: { get_publicPersonasPersonaIdActivity: read } }} />);
  expect(read).not.toHaveBeenCalled(); resolve("anonymous");
  await vi.waitFor(() => expect(element.querySelector('[data-community-post="profile-story-post"]')).not.toBeNull());
  expect(read.mock.calls[0]?.[0]).toEqual({ path: { personaId: "owned" }, query: { surface: "posts" } });
  expect(read).toHaveBeenCalledTimes(1);
  expect(element.querySelector('[role="tab"]')).toBeNull();
  // Comments live on their posts; a stray comment row is never listed here.
  expect(element.querySelector('[data-comment-id]')).toBeNull();
  expect(element.textContent).not.toContain("The chorus");
});
test("discards a response from a previous profile after navigation", async () => {
  let resolve!: (value: GetPublicProfileActivityResponse) => void;
  const first = new Promise<GetPublicProfileActivityResponse>(done => { resolve = done; });
  const read = vi.fn(async (input: { path: { personaId: string } }) => input.path.personaId === "old" ? first : empty);
  const [persona, setPersona] = createSignal("old");
  const element = render(() => <ProfileActivity personaId={persona()} dependencies={{ resolveSession: async () => "anonymous", client: { get_publicPersonasPersonaIdActivity: read } }} />);
  await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1)); setPersona("new");
  await vi.waitFor(() => expect(element.textContent).toContain("No posts to show."));
  resolve(profileActivityFixture); await new Promise(done => setTimeout(done, 0));
  expect(element.textContent).not.toContain("Harbor Lights");
});
test("continues an empty page with a cursor and stops repeated cursors", async () => {
  const read = vi.fn(async () => ({ ...empty, next_cursor: "cursor" }));
  const element = render(() => <ProfileActivity personaId="owned" dependencies={{ resolveSession: async () => "anonymous", client: { get_publicPersonasPersonaIdActivity: read } }} />);
  await vi.waitFor(() => expect(element.textContent).toContain("Load more"));
  [...element.querySelectorAll("button")].find(button => button.textContent === "Load more")!.click();
  await vi.waitFor(() => expect(element.querySelector('[role="alert"]')).not.toBeNull());
  expect(read).toHaveBeenCalledTimes(2);
});

test("session refresh clears previous member activity before the anonymous response arrives", async () => {
  let resolve!: (value: GetPublicProfileActivityResponse) => void;
  const next = new Promise<GetPublicProfileActivityResponse>(done => { resolve = done; });
  const member = { ...profileActivityFixture, items: profileActivityFixture.items.filter(item => item.kind === "post") };
  let reads = 0; let signedIn = true;
  const read = vi.fn(async () => ++reads === 1 ? member : next);
  const element = render(() => <ProfileActivity personaId="owned" dependencies={{
    resolveSession: async () => signedIn ? { status: "authenticated", userId: "member", personas: [] } : "anonymous",
    client: { get_publicPersonasPersonaIdActivity: read },
  }} />);
  await vi.waitFor(() => expect(element.textContent).toContain("Harbor Lights"));
  signedIn = false; refreshSession();
  await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  expect(element.textContent).not.toContain("Harbor Lights");
  resolve(empty); await vi.waitFor(() => expect(element.textContent).toContain("No posts to show."));
});

test.each(["anonymous", "authenticated"] as const)("the %s activity transport uses the resolved viewer's credential policy", async viewer => {
  const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json(empty));
  vi.stubGlobal("fetch", fetchImpl);
  render(() => <ProfileActivity personaId="owned" dependencies={{ resolveSession: async () => viewer === "anonymous" ? "anonymous" : { status: "authenticated", userId: "viewer", personas: [] } }} />);
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
  const init = fetchImpl.mock.calls[0]?.[1];
  expect(init?.credentials).toBe(viewer === "anonymous" ? "omit" : "same-origin");
});
