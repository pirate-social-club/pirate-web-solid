import { assign, fromPromise, setup } from "xstate";

import type { MediaSubmissionSnapshot } from "../media-submission/contracts";
import { projectMediaSubmission, type SongSubmissionView } from "../media-submission/projection";

/** The part of the song coordinator the observer needs once a song is submitted. */
export interface SongObservationSource {
  /** Reads the submission's current state from the server. */
  readonly refresh: () => Promise<MediaSubmissionSnapshot | null>;
  /** Asks the server to run processing again after a retryable failure. */
  readonly retry: () => Promise<MediaSubmissionSnapshot>;
}

export interface SongObservationContext {
  readonly view: SongSubmissionView;
  /** Consecutive reads that did not return a state. */
  readonly failures: number;
  readonly startHeld: boolean;
}

export type SongObservationEvent =
  /** Read again now instead of waiting for the timer. */
  | { readonly type: "CHECK" }
  /** Run processing again after it failed. */
  | { readonly type: "RETRY" }
  /** The session ended: stop reading until the same account is back. */
  | { readonly type: "PAUSE" }
  | { readonly type: "RESUME" };

export interface SongObservationInput {
  readonly view: SongSubmissionView;
  readonly held?: boolean;
}

export const OBSERVE_INTERVAL_MS = 3_000;
/** Unanswered reads before the author is told checking is taking longer. */
export const SLOW_AFTER_FAILURES = 3;

export function observeDelayMs(failures: number, intervalMs = OBSERVE_INTERVAL_MS): number {
  return failures === 0 ? intervalMs : Math.min(intervalMs * 10, intervalMs * 2 ** Math.min(failures, 4));
}

/** The server will not change this state on its own. */
export function settled(view: SongSubmissionView): boolean {
  return view.status === "published" || view.status === "blocked" || view.status === "abandoned";
}

/** Processing stopped and only the author can move it on. */
function needsAuthor(view: SongSubmissionView): boolean {
  return view.status === "processing_failed" || view.status === "action_required";
}

/**
 * Watches one submitted song until the server publishes or refuses it.
 *
 * The song steps end when the server accepts the submission. From then on the
 * author is free to leave, and this machine is the only thing reading the
 * song's state. A read that fails says nothing about the song, so it is tried
 * again on a slower timer and never turned into a failure of the song itself.
 */
export function createSongObservationMachine(source: SongObservationSource, intervalMs = OBSERVE_INTERVAL_MS) {
  return setup({
    types: {
      // SAFETY: type carrier only.
      context: {} as SongObservationContext,
      // SAFETY: type carrier only.
      events: {} as SongObservationEvent,
      // SAFETY: type carrier only.
      input: {} as SongObservationInput,
    },
    actors: {
      read: fromPromise<SongSubmissionView | null>(async () => {
        const snapshot = await source.refresh();
        return snapshot === null ? null : projectMediaSubmission(snapshot);
      }),
      rerun: fromPromise<SongSubmissionView>(async () => projectMediaSubmission(await source.retry())),
    },
    delays: {
      observeDelay: ({ context }) => observeDelayMs(context.failures, intervalMs),
      idleDelay: intervalMs * 10,
    },
    guards: {
      isSettled: ({ context }) => settled(context.view),
      needsAuthor: ({ context }) => needsAuthor(context.view),
    },
  }).createMachine({
    id: "songObservation",
    context: ({ input }) => ({ view: input.view, failures: 0, startHeld: input.held === true }),
    initial: "starting",
    states: {
      starting: {
        always: [
          { guard: ({ context }) => context.startHeld && !settled(context.view), target: "held" },
          { target: "routing" },
        ],
      },
      // Where a known state belongs. Entered at the start and after every read.
      routing: {
        always: [
          { guard: "isSettled", target: "settled" },
          { guard: "needsAuthor", target: "waitingForAuthor" },
          { target: "waiting" },
        ],
      },
      waiting: {
        after: { observeDelay: { target: "reading" } },
        on: { CHECK: { target: "reading" }, PAUSE: { target: "held" } },
      },
      reading: {
        invoke: {
          src: "read",
          onDone: [
            {
              guard: ({ event }) => event.output !== null,
              target: "routing",
              actions: assign({ view: ({ event, context }) => event.output ?? context.view, failures: 0 }),
            },
            { target: "waiting", actions: assign({ failures: ({ context }) => context.failures + 1 }) },
          ],
          onError: { target: "waiting", actions: assign({ failures: ({ context }) => context.failures + 1 }) },
        },
        on: { PAUSE: { target: "held" } },
      },
      waitingForAuthor: {
        // Nothing moves until the author acts, but the server can still end
        // the wait on its own, for instance when a request for the original
        // song expires. Keep reading, slowly.
        after: { idleDelay: { target: "reading" } },
        on: {
          RETRY: { guard: ({ context }) => context.view.status === "processing_failed" && context.view.retryable, target: "rerunning" },
          CHECK: { target: "reading" },
          PAUSE: { target: "held" },
        },
      },
      rerunning: {
        invoke: {
          src: "rerun",
          onDone: { target: "routing", actions: assign({ view: ({ event }) => event.output, failures: 0 }) },
          // The request went unanswered, which says nothing about whether the
          // server took it. Read the song's state instead of assuming it is
          // unchanged: it may already be processing again.
          onError: { target: "reading" },
        },
        on: { PAUSE: { target: "held" } },
      },
      held: {
        on: { RESUME: { target: "reading" } },
      },
      settled: { type: "final" },
    },
  });
}

export type SongObservationMachine = ReturnType<typeof createSongObservationMachine>;
