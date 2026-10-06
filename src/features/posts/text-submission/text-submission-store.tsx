/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { createContext, createEffect, createSignal, onCleanup, useContext, type Accessor } from "solid-js";
import { createActor, type ActorRefFrom } from "xstate";

import { createPendingSubmissionEnvelope } from "../post-composer/pending-submission";
import type { TextContentSubmissionRequestEnvelopeV1 } from "../post-composer/text-submission-contract";
import {
  createSameOriginTextSubmissionTransport,
  type TextSubmissionTransport,
} from "../post-composer/text-submission-transport";
import { requestGlobalSignIn } from "../../auth/global-sign-in-host.tsx";
import { useApplicationSession } from "../../shell/application-session.tsx";
import {
  createTextSubmissionMachine,
  DELAYED_AFTER_ATTEMPTS,
  type TextSubmissionMachine,
  type TextSubmissionRejection,
} from "./text-submission-machine";

export interface TextSubmissionDraft {
  readonly accountId: string;
  readonly communityId: string;
  readonly personaId: string;
  readonly title: string;
  readonly body: string;
  readonly ageGatePolicy: "none" | "18_plus";
  readonly authorHandle?: string;
  readonly authorAvatarSrc?: string | null;
}

/**
 * What the author's own pending post is doing. `sending` covers every attempt
 * the author does not need to know about; `delayed` is the same work after
 * enough attempts that saying nothing would be misleading. Neither means the
 * post failed: only `rejected` is a server answer that it was refused.
 * `sign_in_required` holds the request until its account is signed in again.
 */
export type TextSubmissionStatus = "sending" | "delayed" | "sign_in_required" | "published" | "rejected";

export interface TextSubmissionItem extends TextSubmissionDraft {
  readonly id: string;
  readonly createdAt: string;
  readonly status: TextSubmissionStatus;
  readonly postHref: string | null;
  readonly postId: string | null;
  readonly rejection: TextSubmissionRejection | null;
}

export interface TextSubmissionStore {
  readonly items: Accessor<readonly TextSubmissionItem[]>;
  /** Shows the post at once and delivers it underneath. Returns its id. */
  readonly submit: (draft: TextSubmissionDraft) => string;
  /** Sends the retained request again now instead of waiting for the timer. */
  readonly retry: (id: string) => void;
  /**
   * Stops work on an item and forgets it. For an item the server has not
   * answered this does not cancel anything: a request already sent can still
   * publish. Surfaces offer it only for a published or refused post.
   */
  readonly dismiss: (id: string) => void;
  /** Forgets every item that belongs to a different account. */
  readonly retainAccount: (accountId: string) => void;
  /** Nobody is signed in: hold every request without sending or forgetting it. */
  readonly pause: () => void;
  /** This account is signed in: send the requests that were held for it. */
  readonly resume: (accountId: string) => void;
  readonly dispose: () => void;
}

export interface TextSubmissionStoreOptions {
  readonly transport?: TextSubmissionTransport;
  readonly createId?: () => string;
  readonly now?: () => string;
  /** A post was just held for lack of a session. */
  readonly onSignInRequired?: () => void;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `text-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function requestFor(draft: TextSubmissionDraft, idempotencyKey: string): TextContentSubmissionRequestEnvelopeV1 {
  const title = draft.title.trim();
  return {
    path: { communityId: draft.communityId.trim() },
    body: {
      idempotency_key: idempotencyKey,
      persona_id: draft.personaId.trim(),
      post_type: "text",
      authorship_mode: "human_direct",
      identity_mode: "public",
      visibility: "public",
      author_declared_rating: draft.ageGatePolicy === "18_plus" ? "adult_18" : "general",
      title: title === "" ? null : title,
      body: draft.body.trim(),
    },
  };
}

/**
 * The one owner of text posts in flight. It lives at the application shell, so
 * a post keeps sending after its composer closes and after the author leaves
 * the community. Requests are held in memory only: a reload drops them.
 */
export function createTextSubmissionStore(options: TextSubmissionStoreOptions = {}): TextSubmissionStore {
  let transport = options.transport;
  let machine: TextSubmissionMachine | undefined;
  const createId = options.createId ?? randomId;
  const now = options.now ?? (() => new Date().toISOString());
  // Written from actor subscriptions and from event handlers inside owned
  // scopes, so the owned-write guard does not apply.
  const [items, setItems] = createSignal<readonly TextSubmissionItem[]>([], { ownedWrite: true });
  const actors = new Map<string, ActorRefFrom<TextSubmissionMachine>>();
  let disposed = false;
  let pausedForSignOut = false;

  const patch = (id: string, change: Partial<TextSubmissionItem>) => {
    if (disposed) return;
    setItems(current => current.map(item => item.id === id ? { ...item, ...change } : item));
  };

  const stop = (id: string) => {
    actors.get(id)?.stop();
    actors.delete(id);
  };

  const start = async (id: string, draft: TextSubmissionDraft) => {
    let envelope;
    try {
      envelope = await createPendingSubmissionEnvelope({
        request: requestFor(draft, createId()),
        pendingRequestId: id,
        createdAt: now(),
      });
    } catch {
      patch(id, { status: "rejected", rejection: "invalid" });
      return;
    }
    if (disposed || !items().some(item => item.id === id)) return;
    transport ??= createSameOriginTextSubmissionTransport();
    machine ??= createTextSubmissionMachine(transport);
    const actor = createActor(machine, { input: { envelope } });
    actors.set(id, actor);
    actor.subscribe(snapshot => {
      if (snapshot.matches("published")) {
        patch(id, { status: "published", postHref: snapshot.context.postHref, postId: snapshot.context.postId });
      } else if (snapshot.matches("rejected")) {
        patch(id, { status: "rejected", rejection: snapshot.context.rejection });
      } else if (snapshot.matches("signInRequired")) {
        const already = items().find(item => item.id === id)?.status === "sign_in_required";
        patch(id, { status: "sign_in_required" });
        if (!already && !pausedForSignOut) options.onSignInRequired?.();
      } else {
        patch(id, { status: snapshot.context.attempts >= DELAYED_AFTER_ATTEMPTS ? "delayed" : "sending" });
      }
    });
    actor.start();
  };

  return {
    items,
    submit(draft) {
      const id = createId();
      setItems(current => [
        { ...draft, id, createdAt: now(), status: "sending", postHref: null, postId: null, rejection: null },
        ...current,
      ]);
      void start(id, draft);
      return id;
    },
    retry(id) {
      actors.get(id)?.send({ type: "RETRY" });
    },
    dismiss(id) {
      stop(id);
      setItems(current => current.filter(item => item.id !== id));
    },
    retainAccount(accountId) {
      for (const item of items()) if (item.accountId !== accountId) stop(item.id);
      setItems(current => current.some(item => item.accountId !== accountId)
        ? current.filter(item => item.accountId === accountId)
        : current);
    },
    pause() {
      // Signing out holds the requests; that is not a reason to prompt.
      pausedForSignOut = true;
      for (const actor of actors.values()) actor.send({ type: "PAUSE" });
    },
    resume(accountId) {
      pausedForSignOut = false;
      for (const item of items()) {
        if (item.accountId === accountId) actors.get(item.id)?.send({ type: "RESUME" });
      }
    },
    dispose() {
      disposed = true;
      for (const id of [...actors.keys()]) stop(id);
    },
  };
}

const TextSubmissionContext = createContext<TextSubmissionStore | null>(null);

/**
 * Mounted once inside the application session. Pending posts belong to the
 * account that sent them. With nobody signed in they are held and shown to no
 * one; they resume when the same account signs in again and are dropped when
 * a different one does. An unresolved or failed session check changes nothing:
 * that is not a change of account.
 */
export function TextSubmissionProvider(props: {
  readonly children: JSX.Element;
  readonly transport?: TextSubmissionTransport;
  readonly store?: TextSubmissionStore;
}): JSX.Element {
  // The server can end a session the shell still believes in. The author may
  // be on any page when that happens, so the prompt is raised from here and
  // not only from the pending post in its community's feed.
  const store = props.store ?? createTextSubmissionStore({ transport: props.transport, onSignInRequired: requestGlobalSignIn });
  const session = useApplicationSession();
  createEffect(
    () => session(),
    (state) => {
      if (state === undefined || state === "resolving" || state === "failed") return;
      if (state === "anonymous") {
        store.pause();
        return;
      }
      // Only a freshly resolved session reaches here, so a held request is
      // never sent on the strength of an identity that is being replaced.
      store.retainAccount(state.userId);
      store.resume(state.userId);
    },
  );
  onCleanup(() => store.dispose());
  return <TextSubmissionContext value={store}>{props.children}</TextSubmissionContext>;
}

export function useTextSubmissionStore(): TextSubmissionStore | null {
  return useContext(TextSubmissionContext);
}
