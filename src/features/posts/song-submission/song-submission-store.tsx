/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { createContext, createEffect, createSignal, onCleanup, useContext, type Accessor } from "solid-js";
import { createActor, type ActorRefFrom } from "xstate";

import { onSessionCleared } from "../../../api/session.ts";
import type { SongSubmissionView } from "../media-submission/projection";
import { useApplicationSession } from "../../shell/application-session.tsx";
import {
  createSongObservationMachine,
  settled,
  SLOW_AFTER_FAILURES,
  type SongObservationMachine,
  type SongObservationSource,
} from "./song-observation-machine";

export interface SongSubmissionHandover {
  readonly submissionId: string;
  readonly accountId: string;
  readonly communityId: string;
  readonly title: string;
  readonly authorHandle?: string;
  readonly authorAvatarSrc?: string | null;
  /** The state the server reported when it accepted the submission. */
  readonly view: SongSubmissionView;
  readonly source: SongObservationSource;
}

export interface SongSubmissionItem extends Omit<SongSubmissionHandover, "source"> {
  /** Reads of the song's state are going unanswered. Says nothing about the song. */
  readonly slow: boolean;
  /** A request to run processing again is in flight. */
  readonly rerunning: boolean;
  readonly bindingOriginal?: boolean;
  readonly originalUnconfirmed?: boolean;
  readonly originalError?: string | null;
  readonly canBindOriginal?: boolean;
}

export interface SongSubmissionStore {
  readonly items: Accessor<readonly SongSubmissionItem[]>;
  /** Takes over a song the server has accepted, so its composer can close. */
  readonly adopt: (handover: SongSubmissionHandover) => void;
  readonly check: (submissionId: string) => void;
  readonly retry: (submissionId: string) => void;
  readonly bindOriginal: (submissionId: string, link: string) => void;
  readonly retryOriginal: (submissionId: string) => void;
  /** Stops watching a song and forgets it here. The server keeps its own state. */
  readonly dismiss: (submissionId: string) => void;
  readonly retainAccount: (accountId: string) => void;
  readonly pause: () => void;
  readonly resume: (accountId: string) => void;
  readonly clear: () => void;
  readonly dispose: () => void;
}

/**
 * The one owner of songs the server is still processing. It lives at the
 * application shell, so a song keeps being watched after its composer closes
 * and after the author leaves the community. It holds nothing but the handle
 * the composer already had: memory only, dropped on reload.
 */
export function createSongSubmissionStore(options: {
  /** How often a song's state is read. Shortened by stories and tests. */
  readonly observeIntervalMs?: number;
  readonly requestTimeoutMs?: number;
} = {}): SongSubmissionStore {
  const [items, setItems] = createSignal<readonly SongSubmissionItem[]>([], { ownedWrite: true });
  const actors = new Map<string, ActorRefFrom<SongObservationMachine>>();
  let paused = false;
  let disposed = false;

  const patch = (id: string, change: Partial<SongSubmissionItem>) => {
    if (disposed) return;
    setItems(current => current.map(item => item.submissionId === id ? { ...item, ...change } : item));
  };
  const stop = (id: string) => {
    actors.get(id)?.stop();
    actors.delete(id);
  };

  return {
    items,
    adopt(handover) {
      const { source, ...item } = handover;
      if (actors.has(item.submissionId)) return;
      setItems(current => [
        { ...item, slow: false, rerunning: false, canBindOriginal: source.bindOriginal !== undefined },
        ...current.filter(existing => existing.submissionId !== item.submissionId),
      ]);
      if (settled(item.view)) return;
      const actor = createActor(createSongObservationMachine(source, options.observeIntervalMs, options.requestTimeoutMs), { input: { view: item.view, held: paused } });
      actors.set(item.submissionId, actor);
      actor.subscribe((snapshot) => {
        patch(item.submissionId, {
          view: snapshot.context.view,
          slow: snapshot.context.failures >= SLOW_AFTER_FAILURES,
          rerunning: snapshot.matches("rerunning"),
          bindingOriginal: snapshot.matches("bindingOriginal"),
          originalError: snapshot.context.originalError,
          originalUnconfirmed: source.hasPendingOriginal?.() === true,
        });
        if (snapshot.status === "done") actors.delete(item.submissionId);
      });
      actor.start();
    },
    check(id) { actors.get(id)?.send({ type: "CHECK" }); },
    retry(id) { actors.get(id)?.send({ type: "RETRY" }); },
    retryOriginal(id) { actors.get(id)?.send({ type: "RETRY_ORIGINAL" }); },
    bindOriginal(id, link) { actors.get(id)?.send({ type: "BIND_ORIGINAL", link }); },
    dismiss(id) {
      stop(id);
      setItems(current => current.filter(item => item.submissionId !== id));
    },
    retainAccount(accountId) {
      for (const item of items()) if (item.accountId !== accountId) stop(item.submissionId);
      setItems(current => current.some(item => item.accountId !== accountId)
        ? current.filter(item => item.accountId === accountId)
        : current);
    },
    pause() {
      paused = true;
      for (const actor of actors.values()) actor.send({ type: "PAUSE" });
    },
    resume(accountId) {
      paused = false;
      for (const item of items()) {
        if (item.accountId === accountId) actors.get(item.submissionId)?.send({ type: "RESUME" });
      }
    },
    clear() {
      for (const id of [...actors.keys()]) stop(id);
      setItems(current => current.length === 0 ? current : []);
    },
    dispose() {
      disposed = true;
      for (const id of [...actors.keys()]) stop(id);
    },
  };
}

const SongSubmissionContext = createContext<SongSubmissionStore | null>(null);

/**
 * Mounted once inside the application session, beside the text submission
 * owner and with the same account rules: a deliberate sign-out forgets the
 * songs being watched, a session that ends any other way holds them for the
 * same account, and a different account drops them. None of this changes the
 * song on the server, which goes on processing either way.
 */
export function SongSubmissionProvider(props: {
  readonly children: JSX.Element;
  readonly store?: SongSubmissionStore;
}): JSX.Element {
  const store = props.store ?? createSongSubmissionStore();
  const session = useApplicationSession();
  createEffect(
    () => session(),
    (state) => {
      if (state === undefined || state === "resolving" || state === "failed") return;
      if (state === "anonymous") {
        store.pause();
        return;
      }
      store.retainAccount(state.userId);
      store.resume(state.userId);
    },
  );
  onCleanup(onSessionCleared(() => store.clear()));
  onCleanup(() => store.dispose());
  return <SongSubmissionContext value={store}>{props.children}</SongSubmissionContext>;
}

export function useSongSubmissionStore(): SongSubmissionStore | null {
  return useContext(SongSubmissionContext);
}
