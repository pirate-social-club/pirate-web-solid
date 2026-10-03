import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot, createSignal, Show } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import HomeRoute from "../../../routes/index.tsx";
import { ApplicationSessionProvider } from "../../shell/application-session.tsx";
import { YourCommunitiesRouteView } from "../../community/your-communities-page/your-communities-route.tsx";
import { freshVideoEntryFromSearch } from "./fresh-composer-entry.ts";
import type { VideoOutcome } from "./claim.ts";

import type { SongSourceReader } from "../post-composer/song-excerpt-source.ts";
const readSong = vi.fn<SongSourceReader>(async request => ({ postId: request.kind === "post" ? request.postId : "song", title: "Frozen song", audioUrl: "https://media.pirate.test/song.mp3" }));
const disposers: (() => void)[] = [];
function render(ui: () => JSX.Element) {
  const container = document.createElement("div"); document.body.appendChild(container);
  createRoot(dispose => { disposers.push(() => { dispose(); container.remove(); }); solidRender(ui, container); });
  return container;
}
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); document.body.replaceChildren(); document.head.replaceChildren(); vi.unstubAllGlobals(); readSong.mockClear(); });

const resolved = { status: "authenticated" as const, userId: "author", personas: [{ personaId: "posting-profile", displayName: null, avatarRef: null, primaryPublicHandle: null, communityBinding: { communityId: "destination", bindingSource: "first_membership" as const } }] };
const memberships = [{ object: "account_community_membership" as const, community_id: "destination", display_name: "Harbor", resource_href: null, canonical_route: null, membership_status: "member" as const, can_post: true as const }];
const emptyFeed = { items: [], topCommunities: [], nextCursor: null };

test.each([
  { label: "frozen song", song: { community_id: "frozen-community", post_id: "frozen-post" } },
  { label: "no song", song: null },
])("Record again navigates to a real fresh composer with $label", async ({ label, song }) => {
  const openStorage = vi.fn(() => { throw new Error("Must not read an earlier take"); });
  vi.stubGlobal("indexedDB", { open: openStorage });
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline song listing"); }));
  Element.prototype.scrollIntoView = vi.fn();
  const navigate = vi.fn();
  const [path, setPath] = createSignal<string>();
  const outcome: VideoOutcome = { submission_id: `navigation-${label}`, kind: "processing_failure", song };
  const entry = () => freshVideoEntryFromSearch(Object.fromEntries(new URL(path()!, "https://web.pirate.test").searchParams));
  const container = render(() => <ApplicationSessionProvider state={() => resolved}>
    <Show when={path()} fallback={<HomeRoute claimVideoOutcome={async () => ({ object: "video_outcome_claim", display_permission: true, outcome })} navigate={href => { navigate(href); setPath(href); }} publicData={emptyFeed} homeData={emptyFeed} />}>
      <YourCommunitiesRouteView videoSongReader={readSong} freshVideo={entry()} loadMemberships={async () => memberships} resolvePostingSession={async () => resolved} readSongTitle={async () => "Frozen song"} />
    </Show>
  </ApplicationSessionProvider>);
  await vi.waitFor(() => expect(container.querySelector("[data-video-outcome-toast] button")).not.toBeNull());
  container.querySelector<HTMLButtonElement>("[data-video-outcome-toast] button")!.click();
  expect(navigate).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(container.querySelector("[data-post-community-id='destination']")).not.toBeNull());
  expect(entry()).toEqual({ song: song === null ? null : { communityId: song.community_id, postId: song.post_id } });
  expect(path()).not.toMatch(/submission|excerpt|take|draft/);
  await vi.waitFor(() => expect(container.querySelector("[data-post-community-id='destination']")).not.toBeNull());
  container.querySelector<HTMLButtonElement>("[data-post-community-id='destination']")!.click();
  await vi.waitFor(() => expect(container.querySelector("[data-create-video-overlay]")).not.toBeNull());
  await vi.waitFor(() => expect(container.querySelector("[data-song-choice-screen]")).not.toBeNull());
  expect(openStorage).not.toHaveBeenCalled();
  expect(container.querySelector("[data-song-choice-screen]")?.getAttribute("aria-hidden")).not.toBe("true");
  expect(container.querySelector("input[name='community-id']")).toBeNull();
  if (song === null) {
    expect(readSong).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Choose a song");
    expect(container.querySelector("audio")?.getAttribute("src")).toBeNull();
  } else {
    await vi.waitFor(() => expect(readSong).toHaveBeenCalled());
    expect(readSong.mock.calls[0]?.[0]).toEqual({ kind: "post", postId: "frozen-post", communityId: "frozen-community" });
  }
  expect(container.querySelector("[aria-label='Record video']")).toBeNull();
  expect([...container.querySelectorAll("button")].some(button => button.textContent === "Publish video")).toBe(false);
});
