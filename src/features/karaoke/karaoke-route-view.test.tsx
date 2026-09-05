import { render } from "@solidjs/web";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AuthenticatedSession } from "../../api/session";
import type { KaraokeApiClient } from "./karaoke-api";
import { KaraokeSessionRouteView } from "./karaoke-route-view";
import { createRouter, memoryHistory } from "@solidjs/router";
import type { UseKaraokeScoringOptions, UseKaraokeScoringResult } from "./scoring/use-karaoke-scoring-session";

// Faithful start boundary without requesting a microphone or opening a socket.
function createScoring(options: UseKaraokeScoringOptions): UseKaraokeScoringResult {
  return {
    enabled: () => options.enabled, state: () => null,
    controls: {
      start: () => { void options.createKaraokeSession(options.communityId, options.postId, "attempt-key", new AbortController().signal); },
      noteFinish() {}, notePause() {}, notePlay() {}, noteSeek() {}, noteTime() {}, stop() {}, abort() {},
    },
  };
}

const disposers: Array<() => void> = [];
const persona = (id: string, communityId: string | null) => ({
  personaId: id, displayName: id, avatarRef: null, primaryPublicHandle: null,
  communityBinding: communityId === null ? null : { communityId, bindingSource: "first_membership" as const },
});

function mount(personas: AuthenticatedSession["personas"]) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const createSession = vi.fn(() => new Promise<never>(() => {}));
  const unused = async (): Promise<never> => { throw new Error("unused"); };
  const client: KaraokeApiClient = {
    createSession, getAttempt: unused, getLeaderboard: unused,
    getPayload: async () => ({
      community: "community-here", id: "revision-1", object: "song_karaoke_payload", post: "post-1",
      karaoke_lines: [{ id: "line-1", index: 0, kind: "lyric", start_ms: 0, end_ms: 2000, text: "Sing this", words: [] }],
    }),
  };
  const TestRouter = createRouter({ history: memoryHistory(), routes: [{ path: "/" }] });
  const dispose = render(() => <TestRouter>{() => <KaraokeSessionRouteView
    postId="post-1" client={client}
    createScoring={createScoring}
    resolveSession={async () => ({ status: "authenticated", userId: "account-1", personas })}
  />}</TestRouter>, host);
  disposers.push(() => { dispose(); host.remove(); });
  return { host, createSession };
}

async function start(host: HTMLElement) {
  await vi.waitFor(() => expect(host.textContent).toContain("Start karaoke"));
  // Wait for session resolution; starting while it is pending must never fall back.
  await Promise.resolve();
  [...host.querySelectorAll("button")].find(button => button.textContent?.trim() === "Start karaoke")!.click();
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
});

describe("Karaoke community persona selection", () => {
  test("uses the sole bound-here persona, never the first global persona", async () => {
    const { host, createSession } = mount([persona("elsewhere", "community-other"), persona("here", "community-here")]);
    await start(host);
    await vi.waitFor(() => expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ personaId: "here" })));
  });

  test("several eligible personas require an explicit choice and cannot mint", async () => {
    const { host, createSession } = mount([persona("first", "community-here"), persona("second", "community-here")]);
    await start(host);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Singing as"));
    expect(createSession).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Create a new persona");
    const option = document.querySelector<HTMLInputElement>('input[value="second"]');
    expect(option).not.toBeNull();
    option!.click();
    await vi.waitFor(() => expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ personaId: "second" })));
  });

  test("unbound and elsewhere personas cannot start a scored take", async () => {
    const { host, createSession } = mount([persona("unbound", null), persona("elsewhere", "community-other")]);
    await start(host);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Join this community"));
    expect(createSession).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
