import { ApiClientError, type DeleteUsersMeLearnerAudioResponse } from "@pirate/api-client";
import { createSignal, Show } from "solid-js";

import { createSessionApiClient, readCsrfCookie, sessionRequestOptions } from "../../api/client.ts";
import { ConfirmDialog, Type } from "../../design-system";

export type DeleteRecordings = () => Promise<DeleteUsersMeLearnerAudioResponse>;

function recordings(count: number): string {
  return count === 1 ? "1 recording" : `${count} recordings`;
}

/** The API deletes one bounded batch per call; Settings keeps asking up to this many times. */
export const MAX_DELETION_ROUNDS = 20;

export interface RecordingDeletionOutcome {
  readonly deleted: number;
  readonly remaining: number;
}

/** What the viewer is told, from the server's counts summed across batches. */
export function recordingDeletionMessage(outcome: RecordingDeletionOutcome): string {
  if (outcome.deleted === 0 && outcome.remaining === 0) return "You have no stored recordings.";
  const deleted = `Deleted ${recordings(outcome.deleted)}.`;
  return outcome.remaining > 0
    ? `${deleted} ${recordings(outcome.remaining)} still stored. Delete again to remove ${outcome.remaining === 1 ? "it" : "them"}.`
    : deleted;
}

/** Each declared failure, named by its real cause. */
export function recordingDeletionError(error: unknown): string {
  if (error instanceof PartialRecordingDeletion) {
    return `Deleted ${recordings(error.deleted)}, then stopped. ${recordingDeletionError(error.cause)}`;
  }
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "Sign in again to delete your recordings.";
    if (error.status === 409) return "A Study or Karaoke recording is still in progress. Finish or leave it, then try again.";
    if (error.status === 502) return "Recording storage is unavailable right now. Try again later.";
  }
  return "Your recordings could not be deleted. Try again.";
}

/**
 * Repeats the bounded deletion until nothing remains, the server stops
 * making progress, or the round limit is reached. Nothing continues in the
 * background, so the outcome reports exactly what is left.
 */
export async function deleteAllRecordings(deleteBatch: DeleteRecordings, maxRounds = MAX_DELETION_ROUNDS): Promise<RecordingDeletionOutcome> {
  let deleted = 0;
  let remaining = 0;
  for (let round = 0; round < maxRounds; round += 1) {
    let result: Awaited<ReturnType<DeleteRecordings>>;
    try {
      result = await deleteBatch();
    } catch (cause) {
      if (deleted > 0) throw new PartialRecordingDeletion(deleted, cause);
      throw cause;
    }
    deleted += result.deleted_count;
    remaining = result.remaining_count;
    if (remaining === 0 || result.deleted_count === 0) break;
  }
  return { deleted, remaining };
}

/** Some batches were deleted before a later one failed. */
export class PartialRecordingDeletion extends Error {
  readonly deleted: number;
  override readonly cause: unknown;
  constructor(deleted: number, cause: unknown) {
    super("partial_recording_deletion");
    this.name = "PartialRecordingDeletion";
    this.deleted = deleted;
    this.cause = cause;
  }
}

const deleteStoredRecordings: DeleteRecordings = async () => {
  const csrf = readCsrfCookie();
  if (!csrf) throw new Error("csrf_unavailable");
  return createSessionApiClient().delete_usersMeLearnerAudio(undefined, sessionRequestOptions(csrf));
};

/**
 * Study and Karaoke tell people they can delete their stored recordings in
 * Settings; this is that control. It deletes what Pirate stores; a copy the
 * speech provider keeps follows the provider's own policy.
 */
export function RecordingsSettings(props: { readonly deleteRecordings?: DeleteRecordings }) {
  const [pending, setPending] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [failed, setFailed] = createSignal(false);
  const run = async () => {
    if (pending()) return;
    setPending(true);
    setMessage("");
    setFailed(false);
    try {
      setMessage(recordingDeletionMessage(await deleteAllRecordings(props.deleteRecordings ?? deleteStoredRecordings)));
    } catch (error) {
      setFailed(true);
      setMessage(recordingDeletionError(error));
    } finally {
      setPending(false);
    }
  };
  return (
    <section aria-labelledby="recordings-heading" class="flex flex-col gap-3">
      <Type as="h2" id="recordings-heading" variant="h3">Recordings</Type>
      <Type class="text-muted-foreground">Study and Karaoke store your microphone recordings privately, set to expire after 24 months. You can delete them now.</Type>
      <div class="self-start">
        <ConfirmDialog
          cancelLabel="Keep them"
          confirmLabel="Delete recordings"
          description="This deletes the Study and Karaoke recordings we store. It can't be undone. A copy our speech provider keeps follows its own policy."
          destructive
          onConfirm={() => void run()}
          title="Delete your recordings?"
          triggerLabel={pending() ? "Deleting…" : "Delete my recordings"}
          triggerVariant="outline"
        />
      </div>
      <Show when={message()}>
        <Type aria-live="polite" class={failed() ? "text-destructive-text" : undefined} role={failed() ? "alert" : "status"}>{message()}</Type>
      </Show>
    </section>
  );
}
