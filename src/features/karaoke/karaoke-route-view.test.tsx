import { KaraokeApiError } from "./karaoke-session-bridge.ts";
import { render } from "@solidjs/web";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AuthenticatedSession } from "../../api/session";
import type { ActivityPersonaPreparationApi } from "../identity/activity-persona-preparation";
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

function mount(personas: AuthenticatedSession["personas"], resolveSession = async (): Promise<AuthenticatedSession> => ({ status: "authenticated", userId: "account-1", personas }), preparationApi?: ActivityPersonaPreparationApi) {
  // Scored-take tests exercise persona and start behavior; the dedicated
  // disclosure tests clear this acknowledgment to prove the capture gate.
  localStorage.setItem("karaoke:microphone-disclosure:v1", "1");
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
    resolveSession={resolveSession}
    preparationApi={preparationApi}
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
  test("retries failed profile reads without claiming the user must join", async () => {
    let unavailable = true;
    const { host, createSession } = mount([], async () => ({ status: "authenticated", userId: "account-1",
      personas: unavailable ? [] : [persona("here", "community-here")],
      personasUnavailable: unavailable ? true as const : undefined }));
    await vi.waitFor(() => expect(host.textContent).toContain("Retry profiles"));
    const retry = [...host.querySelectorAll("button")].find(button => button.textContent?.trim() === "Retry profiles")!;
    expect(retry.closest('[role="status"]')).toBeNull();
    expect(retry.parentElement?.querySelector('[role="status"]')).not.toBeNull();
    await start(host);
    expect(host.textContent).not.toContain("Join this community");
    expect(createSession).not.toHaveBeenCalled();
    unavailable = false;
    [...host.querySelectorAll("button")].find(button => button.textContent?.trim() === "Retry profiles")!.click();
    await vi.waitFor(() => expect(host.textContent).not.toContain("Retry profiles"));
    expect(createSession).not.toHaveBeenCalled();
    await start(host);
    await vi.waitFor(() => expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ personaId: "here" })));
  });

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

  test("an account without a community persona prepares one instead of joining", async () => {
    const prepare = vi.fn(async () => ({
      activity_presentation: null,
      community_id: "community-here",
      object: "activity_persona_preparation" as const,
      persona_id: "unbound",
      persona_status: "active" as const,
    }));
    const { host, createSession } = mount(
      [persona("unbound", null), persona("elsewhere", "community-other")],
      async () => ({ status: "authenticated", userId: "account-1",
        personas: [persona("unbound", null), persona("elsewhere", "community-other")] }),
      { prepare },
    );
    await start(host);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Set up singing"));
    expect(document.body.textContent).not.toContain("Join this community");
    expect(createSession).not.toHaveBeenCalled();
    const option = document.querySelector<HTMLInputElement>('input[value="unbound"]');
    expect(option).not.toBeNull();
    option!.click();
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledWith(expect.objectContaining({
      choice: { kind: "existing", personaId: "unbound" },
      communityId: "community-here",
    })));
    await vi.waitFor(() => expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ personaId: "unbound" })));
  });

  test("a pending wallet offers an actionable confirmation without joining", async () => {
    let confirmed = false;
    const prepare = vi.fn(async () => ({
      activity_presentation: null,
      community_id: "community-here",
      object: "activity_persona_preparation" as const,
      persona_id: "persona-new",
      persona_status: "pending_wallet" as const,
    }));
    const completion = new Promise<{ complete: (authenticated: boolean) => void }>(resolve => {
      window.addEventListener("pirate:connect", event => {
        resolve((event as CustomEvent<{ complete: (authenticated: boolean) => void }>).detail);
      }, { once: true });
    });
    const { host, createSession } = mount(
      [persona("elsewhere", "community-other")],
      async () => ({ status: "authenticated", userId: "account-1",
        personas: confirmed ? [persona("persona-new", "community-here")] : [persona("elsewhere", "community-other")] }),
      { prepare },
    );
    await start(host);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Set up singing"));
    const create = document.querySelector<HTMLInputElement>(`input[value="__create_new_persona__"]`);
    expect(create).not.toBeNull();
    create!.click();
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledWith(expect.objectContaining({
      choice: { kind: "create_new" },
    })));
    await vi.waitFor(() => expect(host.textContent).toContain("Confirm wallet and continue"));
    expect(createSession).not.toHaveBeenCalled();
    confirmed = true;
    [...host.querySelectorAll("button")].find(button => button.textContent?.trim() === "Confirm wallet and continue")!.click();
    (await completion).complete(true);
    await vi.waitFor(() => expect(host.textContent).not.toContain("Confirm wallet and continue"));
    await vi.waitFor(() => {
      [...host.querySelectorAll("button")].find(button => button.textContent?.trim() === "Start karaoke")?.click();
      expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ personaId: "persona-new" }));
    });
  });
});

describe("Karaoke first-use microphone disclosure", () => {
  test("blocks capture until the disclosure is acknowledged", async () => {
    const { host, createSession } = mount([persona("here", "community-here")]);
    localStorage.clear();
    await start(host);
    await vi.waitFor(() => expect(host.querySelector("[data-karaoke-mic-disclosure]")).toBeTruthy());
    expect(host.textContent).toContain("ElevenLabs");
    expect(host.textContent).toContain("24 months");
    expect(createSession).not.toHaveBeenCalled();

    [...host.querySelectorAll("button")]
      .find(button => button.textContent?.trim() === "Cancel")!
      .click();
    await vi.waitFor(() => expect(host.querySelector("[data-karaoke-mic-disclosure]")).toBeNull());
    expect(createSession).not.toHaveBeenCalled();

    await start(host);
    await vi.waitFor(() => expect(host.querySelector("[data-karaoke-mic-disclosure]")).toBeTruthy());
    host.querySelector<HTMLElement>("[data-karaoke-mic-disclosure-accept]")?.click();
    await vi.waitFor(() => expect(createSession).toHaveBeenCalledOnce());
    expect(localStorage.getItem("karaoke:microphone-disclosure:v1")).toBe("1");
  });

  test("starts the scored take without the dialog once acknowledged", async () => {
    const { host, createSession } = mount([persona("here", "community-here")]);
    await start(host);
    await vi.waitFor(() => expect(createSession).toHaveBeenCalledOnce());
    expect(host.querySelector("[data-karaoke-mic-disclosure]")).toBeNull();
  });
});

test("an age-locked song verifies before karaoke loads and never starts a scored take automatically", async()=>{
  const host=document.createElement("div");document.body.appendChild(host);
  let verified=false;const createSession=vi.fn(()=>new Promise<never>(()=>{}));
  const unused=async():Promise<never>=>{throw new Error("unused");};
  const client:KaraokeApiClient={createSession,getAttempt:unused,getLeaderboard:unused,getPayload:async()=>{
    if(!verified) throw new KaraokeApiError("age_locked","Age required",403,false);
    return {community:"community-here",id:"revision-1",object:"song_karaoke_payload",post:"post-1",karaoke_lines:[{id:"line-1",index:0,kind:"lyric",start_ms:0,end_ms:2000,text:"Authorized lyrics",words:[]}]};
  }};
  const TestRouter=createRouter({history:memoryHistory(),routes:[{path:"/"}]});
  const dispose=render(()=><TestRouter>{()=><KaraokeSessionRouteView postId="post-1" client={client} createScoring={createScoring}
    verifyAge={async()=>{verified=true;return true;}} resolveSession={async()=>({status:"authenticated",userId:"account-1",personas:[persona("here","community-here")]})} />}</TestRouter>,host);
  disposers.push(()=>{dispose();host.remove();});
  await vi.waitFor(()=>expect(host.textContent).toContain("Verify 18+ to view"));
  expect(host.textContent).not.toContain("Authorized lyrics");
  [...host.querySelectorAll("button")].find(button=>button.textContent?.includes("Verify 18+"))?.click();
  await vi.waitFor(()=>expect(host.querySelector("[data-age-access-prompt]")).toBeNull());
  expect(createSession).not.toHaveBeenCalled();
});
