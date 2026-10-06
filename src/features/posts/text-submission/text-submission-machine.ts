import { assign, fromPromise, setup } from "xstate";

import type { PendingSubmissionEnvelopeV1 } from "../post-composer/pending-submission";
import type { TextContentSubmissionV1 } from "../post-composer/text-submission-contract";
import {
  IdempotencyConflictError,
  TextSubmissionServerRejectionError,
  type TextSubmissionTransport,
} from "../post-composer/text-submission-transport";

/** Why the server refused a text post. Only a definitive answer lands here;
 * anything the client could not read is unconfirmed, never a refusal. */
export type TextSubmissionRejection = "not_allowed" | "invalid" | "held" | "blocked";

export interface TextSubmissionContext {
  /** The exact request, kept for the life of the operation. Every attempt
   * sends these bytes under this idempotency key. */
  readonly envelope: PendingSubmissionEnvelopeV1;
  readonly attempts: number;
  readonly submissionId: string | null;
  readonly postHref: string | null;
  readonly postId: string | null;
  readonly rejection: TextSubmissionRejection | null;
}

export type TextSubmissionEvent = { readonly type: "RETRY" };

export interface TextSubmissionInput {
  readonly envelope: PendingSubmissionEnvelopeV1;
}

/** Attempts before the author is told the post has not been sent yet. */
export const DELAYED_AFTER_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000] as const;

export function retryDelayMs(attempts: number): number {
  return RETRY_DELAYS_MS[Math.min(Math.max(attempts, 1), RETRY_DELAYS_MS.length) - 1] ?? 15_000;
}

type Outcome =
  | { readonly kind: "published"; readonly postHref: string; readonly postId: string }
  | { readonly kind: "rejected"; readonly rejection: TextSubmissionRejection }
  | { readonly kind: "conflict"; readonly submissionId: string }
  | { readonly kind: "unconfirmed" };

function projectSnapshot(snapshot: TextContentSubmissionV1): Outcome {
  if (snapshot.status === "published") {
    return snapshot.published_resource?.kind === "post"
      ? { kind: "published", postHref: snapshot.published_resource.href, postId: snapshot.published_resource.post_id }
      : { kind: "unconfirmed" };
  }
  return { kind: "rejected", rejection: snapshot.status === "blocked" ? "blocked" : "held" };
}

function rejectionFor(error: TextSubmissionServerRejectionError): TextSubmissionRejection {
  return error.status === 403 || error.status === 404 ? "not_allowed" : "invalid";
}

/**
 * One text post from the moment it is sent until the server has answered.
 *
 * The author sees the post at once, so this machine has no state that asks
 * them to wait or to check. A response the client could not read is replayed
 * with the same bytes and key until the server answers; the server returns the
 * original result for a key it has already seen, so a replay confirms a post
 * that was published without creating a second one.
 */
export function createTextSubmissionMachine(transport: TextSubmissionTransport) {
  return setup({
    types: {
      // SAFETY: type carrier only.
      context: {} as TextSubmissionContext,
      // SAFETY: type carrier only.
      events: {} as TextSubmissionEvent,
      // SAFETY: type carrier only.
      input: {} as TextSubmissionInput,
    },
    actors: {
      deliver: fromPromise<Outcome, { readonly envelope: PendingSubmissionEnvelopeV1; readonly submissionId: string | null }>(
        async ({ input }) => {
          try {
            if (input.submissionId !== null) {
              const known = await transport.read(input.submissionId);
              if (known !== null) return projectSnapshot(known);
            }
            return projectSnapshot(await transport.dispatch(input.envelope));
          } catch (error) {
            if (error instanceof IdempotencyConflictError) return { kind: "conflict", submissionId: error.submission_id };
            if (error instanceof TextSubmissionServerRejectionError && error.definitive) {
              return { kind: "rejected", rejection: rejectionFor(error) };
            }
            return { kind: "unconfirmed" };
          }
        },
      ),
    },
    delays: {
      retryDelay: ({ context }) => retryDelayMs(context.attempts),
    },
  }).createMachine({
    id: "textSubmission",
    context: ({ input }) => ({
      envelope: input.envelope,
      attempts: 0,
      submissionId: input.envelope.submission_id,
      postHref: null,
      postId: null,
      rejection: null,
    }),
    initial: "sending",
    states: {
      sending: {
        entry: assign({ attempts: ({ context }) => context.attempts + 1 }),
        invoke: {
          src: "deliver",
          input: ({ context }) => ({ envelope: context.envelope, submissionId: context.submissionId }),
          onDone: [
            {
              guard: ({ event }) => event.output.kind === "published",
              target: "published",
              actions: assign({
                postHref: ({ event }) => event.output.kind === "published" ? event.output.postHref : null,
                postId: ({ event }) => event.output.kind === "published" ? event.output.postId : null,
              }),
            },
            {
              guard: ({ event }) => event.output.kind === "rejected",
              target: "rejected",
              actions: assign({
                rejection: ({ event }) => event.output.kind === "rejected" ? event.output.rejection : null,
              }),
            },
            {
              // The key is bound to a submission the server already holds;
              // the next attempt reads it instead of sending again.
              guard: ({ event }) => event.output.kind === "conflict",
              target: "waiting",
              actions: assign({
                submissionId: ({ event }) => event.output.kind === "conflict" ? event.output.submissionId : null,
              }),
            },
            { target: "waiting" },
          ],
          onError: { target: "waiting" },
        },
      },
      waiting: {
        after: { retryDelay: { target: "sending" } },
        on: { RETRY: { target: "sending" } },
      },
      published: { type: "final" },
      rejected: { type: "final" },
    },
  });
}

export type TextSubmissionMachine = ReturnType<typeof createTextSubmissionMachine>;
