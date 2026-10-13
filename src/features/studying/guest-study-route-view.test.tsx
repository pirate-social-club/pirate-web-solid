import type { JSX } from "@solidjs/web";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { StudyV2Api } from "./study-v2-api";
import type { GuestStudyApi } from "./guest-study-api";
import { createGuestStudyAnswerJournal, type GuestStudyAnswerJournal } from "./guest-study-answer-journal";
import { createPageGuestStudyAnswerStorage } from "./guest-study-answer-storage";
import { refreshSession } from "../../api/session";
import { GuestStudyRouteView, type GuestStudyRouteViewProps } from "./guest-study-route-view";
import { StudyV2RouteView } from "./study-v2-route-view";
import { guestApi, guestSession, prepared } from "./guest-study-test-fixtures";

const disposers: Array<() => void> = [];
function render(ui: () => JSX.Element): HTMLElement {
  const node = document.createElement("div"); document.body.appendChild(node);
  let dispose = () => {};
  createRoot(rootDispose => { dispose = rootDispose; solidRender(ui, node); });
  disposers.push(() => { dispose(); node.remove(); });
  return node;
}
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); document.head.replaceChildren(); });
function button(node: HTMLElement, text: string): HTMLButtonElement {
  const result = [...node.querySelectorAll("button")].find(candidate => candidate.textContent?.trim() === text);
  if (result === undefined) throw new Error(`Missing action: ${text}`);
  return result;
}
function coordinator(): NonNullable<GuestStudyRouteViewProps["startCoordinator"]> {
  return {
    start: vi.fn(async () => ({ entryKind: "new_session" as const, status: "started" as const, session: guestSession(), credentialId: "proof-1", recoveryProfile: "persistent" as const })),
    resume: vi.fn(async () => ({ entryKind: "recovered_session" as const, status: "started" as const, session: guestSession(), credentialId: "proof-1", recoveryProfile: "persistent" as const })),
    renew: vi.fn(async () => ({ status: "ready" as const, ownerId: "100", credentialId: "proof-1", recoveryProfile: "persistent" as const })),
    selectedCredentialId: () => "proof-1",
  };
}

/** Protocol fixture only: actual metadata adapter/lock logic, no native IDB claim. */
function answerJournal(storage = createPageGuestStudyAnswerStorage(window.location.origin)): GuestStudyAnswerJournal {
  let tail: Promise<unknown> = Promise.resolve();
  return createGuestStudyAnswerJournal({ origin: window.location.origin, profile: "persistent",
    storage, locks: { exclusive: work => {
      const run = tail.then(work); tail = run.then(() => undefined, () => undefined); return run;
    } } });
}

const publicReader = { load: async () => ({ communityId: "community-1", prepared: prepared() }) };
async function consentAndStart(node: HTMLElement): Promise<void> {
  const checkbox = node.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (checkbox === null) throw new Error("Missing disclosure consent");
  checkbox.click();
  await vi.waitFor(() => expect(button(node, "Start practice").disabled).toBe(false));
  button(node, "Start practice").click();
}
function accountApi(): StudyV2Api {
  const unused = async (): Promise<never> => { throw new Error("Unexpected ordinary effect"); };
  return { loadAvailability: vi.fn<StudyV2Api["loadAvailability"]>(async () => ({ communityId: "community-1", availability: {
    state: "ready", available_exercise_types: ["say_it_back", "translation_choice"], learning_language: "en",
    target_languages: ["ar"], learner_bands: ["A1"],
  } })), createSession: unused, getSession: unused, requestGeneration: unused,
  submitAudio: unused, submitChoice: unused, deleteLearnerAudio: unused };
}


describe("Guest public Study route", () => {

  test("clean initialized reload continues without registering a recovered session", async () => {
    const selected = coordinator(), session = guestSession();
    const storage = createPageGuestStudyAnswerStorage(window.location.origin);
    const original = answerJournal(storage), restored = answerJournal(storage);
    const scope = { origin: window.location.origin, ownerId: session.owner_id, communityId: session.community_id, sessionId: session.session_id };
    await original.registerNewSession(scope, { entryKind: "new_session", session });
    const register = vi.spyOn(restored, "registerNewSession");
    const node = render(() => <GuestStudyRouteView communityId="community-1" postId="post-1" api={guestApi({ getSession: async () => session })}
      publicReader={publicReader} startCoordinator={selected} answerJournal={restored} />);
    await vi.waitFor(() => expect(button(node, "Resume previous lesson").disabled).toBe(false));
    button(node, "Resume previous lesson").click();
    await vi.waitFor(() => expect(node.textContent).toContain("Sing line 1"));
    expect(register).not.toHaveBeenCalled(); expect(node.querySelector("[data-guest-study-read-only-recovery]")).toBeNull();
    expect(selected.start).not.toHaveBeenCalled();
  });

  test("unknown persisted answer stays readonly and a session read never clears its marker", async () => {
    const selected = coordinator(), session = guestSession();
    const storage = createPageGuestStudyAnswerStorage(window.location.origin);
    const original = answerJournal(storage), restored = answerJournal(storage);
    const scope = { origin: window.location.origin, ownerId: session.owner_id, communityId: session.community_id, sessionId: session.session_id };
    await original.registerNewSession(scope, { entryKind: "new_session", session });
    const marker = { ...scope, sessionItemId: "item-1", attemptNumber: 1, idempotencyKey: "original-key" };
    await expect(original.submit(marker, async () => { throw new Error("Owned original answer uncertainty"); })).rejects.toThrow();
    const submit = vi.fn<GuestStudyApi["submitAnswer"]>();
    const node = render(() => <GuestStudyRouteView communityId="community-1" postId="post-1" api={guestApi({ getSession: async () => session, submitAnswer: submit })}
      publicReader={publicReader} startCoordinator={selected} answerJournal={restored} />);
    await vi.waitFor(() => expect(button(node, "Resume previous lesson").disabled).toBe(false));
    button(node, "Resume previous lesson").click();
    await vi.waitFor(() => expect(node.querySelector("[data-guest-study-read-only-recovery]")).not.toBeNull());
    expect(await restored.read(scope)).toEqual(marker); expect(submit).not.toHaveBeenCalled(); expect(selected.start).not.toHaveBeenCalled();
  });


  test("unresolved account resolver cannot block public preparation or a Guest start", async () => {
    const selected = coordinator(); const ordinary = accountApi();
    let resolveAccount: (() => void) | undefined;
    const resolution = new Promise<"anonymous">(resolve => { resolveAccount = () => resolve("anonymous"); });
    const resolve = vi.fn(() => resolution);
    const node = render(() => <StudyV2RouteView communityId="community-1" postId="post-1" api={ordinary} resolveSession={resolve}
      guest={{ api: guestApi({ getSession: async () => guestSession() }), publicReader, startCoordinator: selected, answerJournal: answerJournal() }} />);
    try {
      await vi.waitFor(() => expect(node.textContent).toContain(prepared().disclosure.text));
      expect(resolve).toHaveBeenCalledOnce(); expect(ordinary.loadAvailability).not.toHaveBeenCalled();
      await consentAndStart(node);
      await vi.waitFor(() => expect(node.textContent).toContain("Sing line 1"));
      expect(selected.start).toHaveBeenCalledOnce(); expect(ordinary.loadAvailability).not.toHaveBeenCalled();
    } finally { resolveAccount?.(); await resolution; }
  });

  test("failed account resolver leaves public practice available without account APIs", async () => {
    const selected = coordinator(); const ordinary = accountApi();
    const node = render(() => <StudyV2RouteView communityId="community-1" postId="post-1" api={ordinary}
      resolveSession={async () => { throw new Error("Owned account lookup failure"); }}
      guest={{ api: guestApi({ getSession: async () => guestSession() }), publicReader, startCoordinator: selected, answerJournal: answerJournal() }} />);
    await vi.waitFor(() => expect(node.textContent).toContain(prepared().disclosure.text));
    expect(node.textContent).not.toContain("Sign in to study"); expect(ordinary.loadAvailability).not.toHaveBeenCalled();
    await consentAndStart(node);
    await vi.waitFor(() => expect(node.textContent).toContain("Sing line 1"));
    expect(selected.start).toHaveBeenCalledOnce(); expect(ordinary.loadAvailability).not.toHaveBeenCalled();
  });

  test("confirmed account may upgrade untouched public entry into original persona preparation", async () => {
    const selected = coordinator(); const ordinary = accountApi();
    let resolveAccount: (() => void) | undefined;
    const resolution = new Promise<{ status: "authenticated"; userId: string; personas: [] }>(resolve => {
      resolveAccount = () => resolve({ status: "authenticated", userId: "ordinary-account", personas: [] });
    });
    const node = render(() => <StudyV2RouteView communityId="community-1" postId="post-1" api={ordinary} resolveSession={() => resolution}
      guest={{ api: guestApi(), publicReader, startCoordinator: selected, answerJournal: answerJournal() }} />);
    try {
      await vi.waitFor(() => expect(node.textContent).toContain(prepared().disclosure.text));
      expect(selected.start).not.toHaveBeenCalled(); expect(ordinary.loadAvailability).not.toHaveBeenCalled();
      resolveAccount?.(); await resolution;
      await vi.waitFor(() => expect(node.textContent).toContain("Set up Study"));
      expect(ordinary.loadAvailability).toHaveBeenCalledOnce(); expect(selected.start).not.toHaveBeenCalled();
      expect(node.querySelector("[data-guest-study-entry]")).toBeNull();
    } finally { resolveAccount?.(); await resolution; }
  });

  test("late successful account resolution cannot replace the Guest source after pin", async () => {
    const selected = coordinator(); const ordinary = accountApi();
    let resolveAccount: (() => void) | undefined;
    const resolution = new Promise<{ status: "authenticated"; userId: string; personas: [] }>(resolve => {
      resolveAccount = () => resolve({ status: "authenticated", userId: "ordinary-account", personas: [] });
    });
    const node = render(() => <StudyV2RouteView communityId="community-1" postId="post-1" api={ordinary} resolveSession={() => resolution}
      guest={{ api: guestApi({ getSession: async () => guestSession() }), publicReader, startCoordinator: selected, answerJournal: answerJournal() }} />);
    try {
      await vi.waitFor(() => expect(node.textContent).toContain(prepared().disclosure.text));
      await consentAndStart(node);
      await vi.waitFor(() => expect(node.textContent).toContain("Sing line 1"));
      resolveAccount?.(); await resolution; await Promise.resolve();
      expect(ordinary.loadAvailability).not.toHaveBeenCalled(); expect(selected.start).toHaveBeenCalledOnce();
      expect(node.textContent).toContain("Sing line 1"); expect(node.querySelector("[data-guest-study-entry]")).toBeNull();
    } finally { resolveAccount?.(); await resolution; }
  });

  test("shows actual public disclosure without sign-in/persona and starts only after consent", async () => {
    const selected = coordinator();
    const api = guestApi({ getSession: async () => guestSession() });
    const node = render(() => <GuestStudyRouteView postId="post-1" api={api} publicReader={publicReader} startCoordinator={selected} answerJournal={answerJournal()} />);
    await vi.waitFor(() => expect(node.textContent).toContain(prepared().disclosure.text));
    expect(node.textContent).toContain("Practice only. This lesson does not create a drawing entry.");
    expect(node.textContent).not.toContain("Sign in to study");
    expect(node.querySelector("[data-operation-persona]")).toBeNull();
    expect(selected.start).not.toHaveBeenCalled();
    expect(button(node, "Start practice").disabled).toBe(true);
    const accepted = node.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (accepted === null) throw new Error("Missing disclosure consent"); accepted.click();
    await vi.waitFor(() => expect(button(node, "Start practice").disabled).toBe(false));
    button(node, "Start practice").click();
    await vi.waitFor(() => expect(selected.start).toHaveBeenCalledOnce());
    expect(selected.start).toHaveBeenCalledWith(expect.objectContaining({ communityId: "community-1", postId: "post-1", draft: expect.objectContaining({
      reward_mode: "practice_only", reward_preview_terms_hash: null, target_language: null, learner_band: null,
      disclosure: { version: "actual-disclosure-v1", accepted: true },
    }) }));
    await vi.waitFor(() => expect(node.textContent).toContain("Sing line 1"));
    expect(node.textContent).not.toContain("Megapot");
  });

  test("pending start offers original recovery and hides new-start controls", async () => {
    const selected = coordinator();
    selected.start = vi.fn(async () => ({ status: "pending" as const, phase: "start" as const, message: "Unconfirmed original", originalKey: "original-key" }));
    const node = render(() => <GuestStudyRouteView postId="post-1" api={guestApi()} publicReader={publicReader} startCoordinator={selected} answerJournal={answerJournal()} />);
    await vi.waitFor(() => expect(node.querySelector('input[type="checkbox"]')).not.toBeNull());
    await consentAndStart(node);
    await vi.waitFor(() => expect(node.textContent).toContain("The original start is awaiting confirmation"));
    expect([...node.querySelectorAll("button")].some(b => b.textContent?.trim() === "Start practice")).toBe(false);
    button(node, "Resume previous lesson").click();
    await vi.waitFor(() => expect(selected.resume).toHaveBeenCalledOnce());
    expect(selected.start).toHaveBeenCalledOnce();
  });

  test("config-free original recovery is read-only and performs no new grading/capture", async () => {
    const selected = coordinator();
    const submit = vi.fn<GuestStudyApi["submitAnswer"]>(); const startCapture = vi.fn(async () => {});
    const node = render(() => <GuestStudyRouteView communityId="community-1" postId="post-1"
      api={guestApi({ submitAnswer: submit })} publicReader={{ load: async () => { throw new Error("Current disclosure unavailable"); } }}
      startCoordinator={selected} answerJournal={answerJournal()} recorder={{ start: startCapture, stop: async () => { throw new Error("unused"); } }} />);
    await vi.waitFor(() => expect(button(node, "Resume previous lesson").disabled).toBe(false));
    button(node, "Resume previous lesson").click();
    await vi.waitFor(() => expect(node.querySelector("[data-guest-study-read-only-recovery]")).not.toBeNull());
    expect(node.textContent).toContain("Answer recovery after reloading is unavailable");
    expect(submit).not.toHaveBeenCalled(); expect(startCapture).not.toHaveBeenCalled(); expect(selected.start).not.toHaveBeenCalled();
  });

  test("account session refresh cannot replace a Guest flow after its deliberate start", async () => {
    const selected = coordinator(); let account = false;
    const resolve = vi.fn(async () => account ? { status: "authenticated" as const, userId: "ordinary-account", personas: [] } : "anonymous" as const);
    const node = render(() => <StudyV2RouteView communityId="community-1" postId="post-1" resolveSession={resolve}
      guest={{ api: guestApi({ getSession: async () => guestSession() }), publicReader, startCoordinator: selected, answerJournal: answerJournal() }} />);
    await vi.waitFor(() => expect(node.querySelector('input[type="checkbox"]')).not.toBeNull());
    await consentAndStart(node);
    await vi.waitFor(() => expect(node.textContent).toContain("Sing line 1")); account = true; refreshSession(); await Promise.resolve();
    expect(resolve).toHaveBeenCalledOnce(); expect(selected.start).toHaveBeenCalledOnce();
    expect(node.textContent).toContain("Sing line 1");
  });

  test("disposed public read is aborted and its late result does not start authority", async () => {
    const selected = coordinator(); let finish: ((value: Awaited<ReturnType<typeof publicReader.load>>) => void) | undefined;
    let signal: AbortSignal | undefined;
    const node = render(() => <GuestStudyRouteView postId="post-1" api={guestApi()} startCoordinator={selected} answerJournal={answerJournal()}
      publicReader={{ load: (_postId, requestSignal) => { signal = requestSignal; return new Promise(resolve => { finish = resolve; }); } }} />);
    await vi.waitFor(() => expect(signal).toBeDefined());
    for (const dispose of disposers.splice(0)) dispose();
    expect(signal?.aborted).toBe(true); finish?.({ communityId: "community-1", prepared: prepared() }); await Promise.resolve();
    expect(node.isConnected).toBe(false); expect(selected.start).not.toHaveBeenCalled();
  });
});
