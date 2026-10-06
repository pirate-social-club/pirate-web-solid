import { describe, expect, it, vi } from "vitest";

import type { PendingSubmissionEnvelopeV1 } from "../post-composer/pending-submission";
import type { TextContentSubmissionV1 } from "../post-composer/text-submission-contract";
import {
  TextSubmissionAuthenticationRequiredError,
  type TextSubmissionTransport,
} from "../post-composer/text-submission-transport";
import { createTextSubmissionStore, type TextSubmissionDraft } from "./text-submission-store";

const published: TextContentSubmissionV1 = {
  submission_id: "sub-1",
  href: "/text-content-submissions/sub-1",
  surface: "text_post",
  status: "published",
  result: { decision: "allow", reason_code: null },
  published_resource: { kind: "post", post_id: "post-1", href: "/posts/post-1" },
  review_ref: null,
  created_at: "2026-10-06T00:00:00Z",
  updated_at: "2026-10-06T00:00:00Z",
};

const draft = (accountId: string): TextSubmissionDraft => ({
  accountId,
  communityId: "community-1",
  personaId: `persona-${accountId}`,
  title: "",
  body: "Hello world",
  ageGatePolicy: "none",
});

/** A server with no session until `signedIn` is set. */
function expiredSession() {
  const dispatched: PendingSubmissionEnvelopeV1[] = [];
  const state = { signedIn: false };
  const transport: TextSubmissionTransport = {
    read: async () => null,
    dispatch: async (envelope) => {
      dispatched.push(envelope);
      if (!state.signedIn) throw new TextSubmissionAuthenticationRequiredError();
      return published;
    },
  };
  return { transport, dispatched, state };
}

const statusOf = (store: ReturnType<typeof createTextSubmissionStore>, id: string) =>
  store.items().find(item => item.id === id)?.status;

describe("text submission store", () => {
  it("prompts for sign-in once when the server ends the session, and resumes the same request", async () => {
    const server = expiredSession();
    const onSignInRequired = vi.fn();
    const store = createTextSubmissionStore({ transport: server.transport, onSignInRequired });
    const id = store.submit(draft("account-one"));
    await vi.waitFor(() => expect(statusOf(store, id)).toBe("sign_in_required"));
    expect(onSignInRequired).toHaveBeenCalledOnce();

    server.state.signedIn = true;
    store.resume("account-one");
    await vi.waitFor(() => expect(statusOf(store, id)).toBe("published"));
    expect(server.dispatched).toHaveLength(2);
    expect(server.dispatched[1]).toBe(server.dispatched[0]);
    store.dispose();
  });

  it("never sends a held request when a different account signs in", async () => {
    const server = expiredSession();
    const store = createTextSubmissionStore({ transport: server.transport });
    const id = store.submit(draft("account-one"));
    await vi.waitFor(() => expect(statusOf(store, id)).toBe("sign_in_required"));

    // What the shell does once a fresh resolution names another account.
    server.state.signedIn = true;
    store.retainAccount("account-two");
    store.resume("account-two");
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(store.items()).toHaveLength(0);
    expect(server.dispatched).toHaveLength(1);
    // Resuming the old account afterwards finds nothing to send.
    store.resume("account-one");
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(server.dispatched).toHaveLength(1);
    store.dispose();
  });

  it("holds requests on sign-out without prompting and without sending", async () => {
    const dispatched: PendingSubmissionEnvelopeV1[] = [];
    const onSignInRequired = vi.fn();
    const store = createTextSubmissionStore({
      transport: { read: async () => null, dispatch: (envelope) => { dispatched.push(envelope); return new Promise<never>(() => {}); } },
      onSignInRequired,
    });
    const id = store.submit(draft("account-one"));
    await vi.waitFor(() => expect(dispatched).toHaveLength(1));
    store.pause();
    await vi.waitFor(() => expect(statusOf(store, id)).toBe("sign_in_required"));
    await new Promise(resolve => setTimeout(resolve, 1_500));
    expect(dispatched).toHaveLength(1);
    expect(onSignInRequired).not.toHaveBeenCalled();
    store.dispose();
  });

  it("holds a post that is still being prepared when the session ends", async () => {
    const server = expiredSession();
    server.state.signedIn = true;
    const onSignInRequired = vi.fn();
    const store = createTextSubmissionStore({ transport: server.transport, onSignInRequired });
    // Preparation hashes the request asynchronously, so no actor exists yet.
    const id = store.submit(draft("account-one"));
    store.pause();
    await vi.waitFor(() => expect(statusOf(store, id)).toBe("sign_in_required"));
    // Long enough for preparation to finish and for a retry timer to fire.
    await new Promise(resolve => setTimeout(resolve, 1_500));
    expect(server.dispatched).toHaveLength(0);
    expect(statusOf(store, id)).toBe("sign_in_required");
    expect(onSignInRequired).not.toHaveBeenCalled();

    store.resume("account-one");
    await vi.waitFor(() => expect(statusOf(store, id)).toBe("published"));
    expect(server.dispatched).toHaveLength(1);
    store.dispose();
  });

  it("clears a post that is still being prepared when the author signs out", async () => {
    const server = expiredSession();
    server.state.signedIn = true;
    const store = createTextSubmissionStore({ transport: server.transport });
    store.submit(draft("account-one"));
    store.clear();
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(store.items()).toHaveLength(0);
    expect(server.dispatched).toHaveLength(0);
    store.dispose();
  });

  it("stops retries on sign-out and does not resume them when the same account returns", async () => {
    const dispatched: PendingSubmissionEnvelopeV1[] = [];
    const store = createTextSubmissionStore({
      transport: {
        read: async () => null,
        dispatch: async (envelope) => { dispatched.push(envelope); throw new Error("no answer"); },
      },
    });
    const id = store.submit(draft("account-one"));
    await vi.waitFor(() => expect(dispatched.length).toBeGreaterThanOrEqual(1));
    store.clear();
    const sent = dispatched.length;
    await vi.waitFor(() => expect(statusOf(store, id)).toBeUndefined());
    // What the shell does when the same account signs in again.
    store.retainAccount("account-one");
    store.resume("account-one");
    await new Promise(resolve => setTimeout(resolve, 2_500));
    expect(dispatched).toHaveLength(sent);
    expect(store.items()).toHaveLength(0);
    store.dispose();
  });
});
