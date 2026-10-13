import type { DeleteGuestLearnerAudioResponse, PutGuestLearningRetentionResponse } from "@pirate/api-client";
import type { GuestStudyApi } from "./guest-study-api";

export type GuestDataApi = Pick<GuestStudyApi, "setLearningRetention" | "deleteLearnerAudio">;
export type RetentionMode = PutGuestLearningRetentionResponse["mode"];
export interface GuestDataState {
  readonly retention: PutGuestLearningRetentionResponse | null;
  readonly retentionStatus: "unknown" | "saving" | "confirmed" | "uncertain";
  readonly requestedMode: RetentionMode | null;
  readonly deletion: DeleteGuestLearnerAudioResponse | null;
  readonly deletionStatus: "idle" | "deleting" | "pending" | "completed" | "uncertain";
}

/** One owner/page. Unknown commands keep their original identity; metadata grants no proof. */
export function createGuestStudyDataController(input: {
  readonly api: GuestDataApi;
  readonly scope: () => { readonly ownerId: string; readonly credentialId: string };
  readonly key: () => string;
  readonly changed: (state: GuestDataState) => void;
}) {
  const owner = input.scope().ownerId;
  let disposed = false;
  let state: GuestDataState = { retention: null, retentionStatus: "unknown", requestedMode: null,
    deletion: null, deletionStatus: "idle" };
  let retentionCommand: { key: string; mode: RetentionMode } | null = null;
  let deletionKey: string | null = null;
  const live = () => !disposed && input.scope().ownerId === owner;
  const publish = (next: GuestDataState) => {
    if (!live()) return;
    state = next;
    input.changed(state);
  };
  return {
    get state() { return state; },
    async setRetention(mode: RetentionMode): Promise<void> {
      if (!live() || state.retentionStatus === "saving") return;
      // A different choice must wait for authoritative resolution of this original command.
      if (retentionCommand && retentionCommand.mode !== mode) return;
      retentionCommand ??= { key: input.key(), mode };
      const command = retentionCommand;
      publish({ ...state, retentionStatus: "saving", requestedMode: command.mode });
      try {
        const result = await input.api.setLearningRetention({
          body: { idempotency_key: command.key, mode: command.mode },
          headers: { "x-guest-credential-id": input.scope().credentialId },
        });
        if (!live()) return;
        if (result.mode !== command.mode) {
          publish({ ...state, retentionStatus: "uncertain" });
          return;
        }
        retentionCommand = null;
        publish({ ...state, retention: result, retentionStatus: "confirmed", requestedMode: null });
      } catch {
        publish({ ...state, retentionStatus: "uncertain" });
      }
    },
    async deleteAudio(): Promise<void> {
      if (!live() || state.deletionStatus === "deleting") return;
      deletionKey ??= input.key();
      const key = deletionKey;
      publish({ ...state, deletionStatus: "deleting" });
      try {
        const result = await input.api.deleteLearnerAudio({
          headers: { "idempotency-key": key, "x-guest-credential-id": input.scope().credentialId },
        });
        if (!live()) return;
        if (result.operation.idempotency_key !== key || result.operation.operation_kind !== "learner_audio_deletion") {
          publish({ ...state, deletionStatus: "uncertain" });
          return;
        }
        if (result.state === "completed") deletionKey = null;
        publish({ ...state, deletion: result, deletionStatus: result.state });
      } catch {
        publish({ ...state, deletionStatus: "uncertain" });
      }
    },
    dispose() { disposed = true; },
  };
}
