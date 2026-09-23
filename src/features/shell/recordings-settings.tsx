import { ApiClientError, type DeleteUsersMeLearnerAudioResponse } from "@pirate/api-client";
import { createSignal, Show } from "solid-js";

import { createSessionApiClient, readCsrfCookie, sessionRequestOptions } from "../../api/client.ts";
import { ConfirmDialog, Type } from "../../design-system";

export type DeleteRecordings = () => Promise<DeleteUsersMeLearnerAudioResponse>;

function recordings(count: number): string {
  return count === 1 ? "1 recording" : `${count} recordings`;
}

/** What the viewer is told after a deletion request, from the server's counts. */
export function recordingDeletionMessage(result: DeleteUsersMeLearnerAudioResponse): string {
  if (result.deleted_count === 0 && result.remaining_count === 0) return "You have no stored recordings.";
  const deleted = `Deleted ${recordings(result.deleted_count)}.`;
  return result.remaining_count > 0 ? `${deleted} ${recordings(result.remaining_count)} are still being deleted.` : deleted;
}

export function recordingDeletionError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "Sign in again to delete your recordings.";
    if (error.status === 409) return "A deletion is already running. Try again in a moment.";
    if (error.status === 502) return "The speech provider couldn't confirm the deletion. Try again.";
  }
  return "Your recordings could not be deleted. Try again.";
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
      setMessage(recordingDeletionMessage(await (props.deleteRecordings ?? deleteStoredRecordings)()));
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
      <Type class="text-muted-foreground">Study and Karaoke keep your microphone recordings privately for up to 24 months.</Type>
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
