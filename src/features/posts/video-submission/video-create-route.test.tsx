import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { AccountCommunityMembership } from "../../../api/account-community-memberships.ts";
import type { SessionResolution } from "../../../api/session.ts";
import { VideoCreateRouteView } from "./video-create-route.tsx";

const disposers: Array<() => void> = [];

function render(ui: () => JSX.Element): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose = () => {};
  createRoot(rootDispose => {
    dispose = rootDispose;
    solidRender(ui, container);
  });
  disposers.push(() => {
    dispose();
    container.remove();
  });
  return container;
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
});

const memberships: readonly AccountCommunityMembership[] = [{
  object: "account_community_membership",
  community_id: "harbor",
  display_name: "Harbor",
  resource_href: null,
  canonical_route: null,
  membership_status: "member",
  can_post: true,
}];

const personas = [
  { personaId: "persona-one", displayName: "Persona One", avatarRef: null, primaryPublicHandle: "persona-one.pirate", communityBinding: null },
];

const session = { status: "authenticated" as const, userId: "account-one", personas };

const preflight = vi.fn(async () => ({
  state: "ready" as const, song_post_id: "song-post", audio_revision: 7, canonical_duration_samples: 150_000 * 48,
  interval_policy: { policy_revision: 1, sample_rate_hz: 48_000 as const, min_clip_duration_samples: 144_000, max_clip_duration_samples: 8_640_000 },
  interval: { accepted: true as const },
}));

const reader = vi.fn(async () => ({ postId: "song-post", audioUrl: "https://audio.example/song.mp3", title: "A song" }));

function pickSongByLink() {
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Search songs"]');
  if (input === null) throw new Error("the sound sheet is not open");
  input.value = "https://pirate.test/p/song-post";
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function driveToLoaded(container: HTMLElement, eligibility: (input: { readonly personaId: string }) => Promise<boolean>) {
  const view = render(() => (
    <VideoCreateRouteView
      loadMemberships={async () => memberships}
      navigate={() => undefined}
      resolveSession={async () => session as SessionResolution}
      videoSongEligibility={eligibility}
      videoSongPreflight={preflight}
      videoSongReader={reader}
    />
  ));
  void container;
  await vi.waitFor(() => expect(view.querySelector("button[aria-label='Add song']")).not.toBeNull());
  view.querySelector<HTMLButtonElement>("button[aria-label='Add song']")!.click();
  await vi.waitFor(() => expect(document.querySelector('input[aria-label="Search songs"]')).not.toBeNull());
  pickSongByLink();
  const use = await vi.waitFor(() => {
    const button = [...document.querySelectorAll("button")].find(candidate => candidate.textContent === "Use the song at this link");
    expect(button).toBeDefined();
    return button as HTMLButtonElement;
  });
  use.click();
  const audio = await vi.waitFor(() => {
    const element = document.querySelector<HTMLAudioElement>("audio[src]");
    expect(element).not.toBeNull();
    return element!;
  });
  Object.defineProperty(audio, "duration", { configurable: true, value: 150 });
  audio.dispatchEvent(new Event("loadedmetadata"));
  return view;
}

describe("video create route", () => {
  test("resolves the session and opens the capture view with Add song", async () => {
    const view = render(() => (
      <VideoCreateRouteView
        loadMemberships={async () => memberships}
        navigate={() => undefined}
        resolveSession={async () => session as SessionResolution}
      />
    ));
    await vi.waitFor(() => expect(view.querySelector("button[aria-label='Add song']")).not.toBeNull());
    expect(view.querySelector("[data-add-sound-sheet]")?.getAttribute("aria-hidden")).toBe("true");
  });

  test("an anonymous session offers sign-in instead of the camera", async () => {
    const view = render(() => (
      <VideoCreateRouteView
        loadMemberships={async () => memberships}
        navigate={() => undefined}
        resolveSession={async () => "anonymous" as SessionResolution}
      />
    ));
    await vi.waitFor(() => expect(view.textContent).toContain("Sign in to post a video."));
    expect(view.querySelector("button[aria-label='Add song']")).toBeNull();
  });

  test("an unreadable policy is a retryable failure on the capture view", async () => {
    let calls = 0;
    const view = await driveToLoaded(document.createElement("div"), async () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error("offline")) : true;
    });
    await vi.waitFor(() => expect(calls).toBe(1));
    const retry = await vi.waitFor(() => {
      const button = [...view.querySelectorAll("button")].find(candidate => candidate.textContent === "Try the check again");
      expect(button).toBeDefined();
      return button as HTMLButtonElement;
    });
    retry.click();
    await vi.waitFor(() => expect(calls).toBe(2));
  });
});
