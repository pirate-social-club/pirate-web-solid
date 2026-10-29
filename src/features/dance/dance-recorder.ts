import { captureSessionAuthority, isCurrentSessionAuthority } from "../../api/browser-session-events";
import { openCameraPreview } from "../posts/video-submission/capture";
import { startDanceCapture, type DanceCaptureHandle, type DanceRecordedTake } from "./dance-capture";
import { prepareDanceCaptureGuide, type DanceCaptureGuide } from "./dance-capture-guide";
import { createDancePreparationController, type DancePreparationView } from "./dance-preparation-controller";
import { danceJournalKey, type DanceJournalScope, type DanceJournalStore } from "./dance-preparation-journal";
import { createDanceRecordingController } from "./dance-recording";
import { createBrowserDanceRecordingStorage } from "./dance-recording-storage";
import { createDanceUploadController, type DanceUploadView } from "./dance-upload-controller";
import { createDanceUploadObserver } from "./dance-upload-observer";
import type { DanceSession } from "./dance-preparation-api";

type Ready = Extract<DancePreparationView, { kind: "capture_ready" }>;
export type DanceRecorderView = Exclude<DancePreparationView, Ready>
  | { readonly kind: "camera"; readonly ready: Ready; readonly stream: MediaStream }
  | { readonly kind: "recovery"; readonly session: Ready["session"] }
  | { readonly kind: "upload"; readonly upload: DanceUploadView };
export type DanceRecorderStage = "preparing_audio" | "recording" | "saving" | "uploading";

/** Composition of consent, camera, guide, original storage and upload. A
 * gesture opens guide audio before its first await. Lost writes retain the
 * same original in memory or durable storage; recovery never auto-recaptures. */
export function createDanceRecorder(options: {
  readonly scope: DanceJournalScope;
  readonly currentScope: () => DanceJournalScope | null;
  readonly store: DanceJournalStore;
  readonly preparationApi?: Parameters<typeof createDancePreparationController>[0]["api"];
  readonly uploadApi?: Parameters<typeof createDanceUploadController>[0]["api"];
  readonly storage?: Parameters<typeof createDanceRecordingController>[0]["storage"];
  readonly put?: Parameters<typeof createDanceUploadController>[0]["put"];
  readonly openCamera?: typeof openCameraPreview;
  readonly prepareGuide?: typeof prepareDanceCaptureGuide;
  readonly capture?: typeof startDanceCapture;
  readonly nowMs?: () => number;
}) {
  const scope = Object.freeze({ ...options.scope }), key = danceJournalKey(scope), authority = captureSessionAuthority();
  const preparation = createDancePreparationController({ ...options, api: options.preparationApi });
  const recordings = createDanceRecordingController({ ...options, preparationStore: options.store, storage: options.storage ?? createBrowserDanceRecordingStorage(scope.accountId) });
  const upload = createDanceUploadController({ ...options, recordings, api: options.uploadApi });
  const observeUpload = createDanceUploadObserver({ ...options, api: options.uploadApi });
  let disposed = false, stream: MediaStream | null = null, guide: DanceCaptureGuide | null = null, capture: DanceCaptureHandle | null = null;
  let ready: Ready | null = null, original: { readonly ready: Ready; readonly take: DanceRecordedTake } | null = null;
  let uploadSession: string | null = null, busy = false;
  const current = (signal: AbortSignal) => {
    signal.throwIfAborted(); const selected = options.currentScope();
    if (disposed || !isCurrentSessionAuthority(authority) || !selected || danceJournalKey(selected) !== key) throw new Error("dance_recorder_scope_changed");
  };
  const release = () => { capture?.cancel(); capture = null; guide?.dispose(); guide = null; for (const track of stream?.getTracks() ?? []) track.stop(); stream = null; };
  const exclusive = async <T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> => {
    current(signal); if (busy) throw new Error("dance_recorder_busy"); busy = true;
    try { return await work(); } finally { busy = false; }
  };
  const supported = (view: DancePreparationView) => {
    const context = view.context;
    if (!context) return;
    if (context.reward_mode === "practice" && context.objectives.length === 0) return;
    const objective = context.objectives[0], policy = context.captured_policy;
    if (context.reward_mode !== "reward_eligible" || context.objectives.length !== 1 || !objective
      || policy.admission !== "money_admitted" || objective.binding.activity !== "dance"
      || objective.binding.grading_family !== "moderator_verdict" || objective.binding.numeric_floor_bps !== null
      || objective.target.community_id !== scope.communityId || objective.target.post_id !== scope.postId
      || objective.target.canonical_song_id !== scope.postId || objective.target.audio_revision !== context.audio_revision
      || objective.binding.offer_id !== objective.target.offer_id || objective.binding.leg_id !== objective.target.pool_leg_id
      || objective.binding.qualification_policy_id !== policy.qualification_policy_version_id
      || objective.binding.qualification_policy_hash !== policy.qualification_policy_hash
      || objective.binding.admission_id !== policy.admission_version || objective.binding.admission_hash !== policy.admission_hash
      || objective.terms.qualification_bindings.filter(binding => Object.entries(objective.binding).every(([key, value]) =>
        Object.entries(binding).some(([candidate, actual]) => candidate === key && actual === value),
      )).length !== 1) throw new Error("dance_recorder_funded_unavailable");
    // The captured context, not the current runtime switch, owns eligibility.
    // Never drop its objective or reinterpret it as practice during recovery.
  };
  const recoverUpload = async (signal: AbortSignal): Promise<DanceRecorderView> => {
    if (!uploadSession) throw new Error("dance_recorder_original_required");
    const view = await upload.resume(uploadSession, signal); current(signal);
    return { kind: "upload", upload: view };
  };
  const saveAndUpload = async (signal: AbortSignal, stage: (value: DanceRecorderStage) => void): Promise<DanceRecorderView> => {
    current(signal); if (!original) return recoverUpload(signal);
    stage("saving"); await recordings.retain(original.ready, original.take, signal); current(signal);
    uploadSession = original.take.sessionId; original = null; ready = null;
    stage("uploading"); return recoverUpload(signal);
  };
  const prepare = async (policyHash: string, signal: AbortSignal): Promise<DanceRecorderView> => {
    current(signal); await recordings.cleanupExpired(signal); current(signal);
    const view = await preparation.prepare(policyHash, signal); current(signal); supported(view);
    if (view.kind === "objectives") {
      const saved = await recordings.restore(view.session.session_id, signal); current(signal);
      if (saved) { uploadSession = view.session.session_id; return { kind: "recovery", session: view.session }; }
    }
    if (view.kind === "capture_ready") throw new Error("dance_recorder_state_inconsistent");
    return view;
  };
  return {
    observe: (expected: DanceSession, signal: AbortSignal): Promise<DanceRecorderView> => exclusive(signal, async () => {
      const observed = await observeUpload(expected, signal); current(signal);
      return { kind: "upload", upload: observed };
    }),
    localPreview: (sessionId: string, signal: AbortSignal) => exclusive(signal, async () => {
      const saved = await recordings.restore(sessionId, signal); current(signal);
      return saved && { blob: saved.blob, expiresAtMs: saved.metadata.expiresAtMs };
    }),
    prepare: (policyHash: string, signal: AbortSignal) => exclusive(signal, () => prepare(policyHash, signal)),
    enter(acceptedTermsHash: string, signal: AbortSignal): Promise<DanceRecorderView> {
      return exclusive(signal, async () => {
        if (original || uploadSession) throw new Error("dance_recorder_original_required");
        const view = await preparation.start(acceptedTermsHash, signal); current(signal); supported(view);
        if (view.kind !== "capture_ready") return view;
        const saved = await recordings.restore(view.session.session_id, signal); current(signal);
        if (saved) { uploadSession = view.session.session_id; return { kind: "recovery", session: view.session }; }
        release(); ready = view;
        const opened = await (options.openCamera ?? openCameraPreview)();
        try {
          current(signal); view.assertCurrent(); stream = opened;
          guide = await (options.prepareGuide ?? prepareDanceCaptureGuide)({ context: view.context, signal,
            assertCurrent: () => { current(signal); view.assertCurrent(); }, deferActivation: true });
          current(signal); view.assertCurrent();
          return { kind: "camera", ready: view, stream: opened };
        } catch (error) { release(); for (const track of opened.getTracks()) track.stop(); ready = null; throw error; }
      });
    },
    /** Called directly from the Record gesture so resume() can unlock audio. */
    record(signal: AbortSignal, stage: (value: DanceRecorderStage) => void, progress: (elapsedMs: number) => void,
      preview?: (take: DanceRecordedTake, expiresAtMs: number) => void): Promise<DanceRecorderView> {
      return exclusive(signal, async () => {
        if (!ready || !stream || !guide || original || uploadSession) throw new Error("dance_recorder_original_required");
        const selected = ready, camera = stream;
        const guard = () => { current(signal); selected.assertCurrent(); };
        guard();
        // Invoke before notifying a renderer or awaiting any network work.
        try {
          await guide.activate(); guard();
          stage("recording"); capture = (options.capture ?? startDanceCapture)({ ready: selected, stream: camera, guide, signal,
            onProgress: elapsedMs => { guard(); progress(elapsedMs); } });
          const take = await capture.result; guard(); original = { ready: selected, take };
          preview?.(take, selected.session.expires_at_ms); guard();
          release(); return await saveAndUpload(signal, stage);
        } finally { release(); }
      });
    },
    recover(policyHash: string, signal: AbortSignal, stage: (value: DanceRecorderStage) => void): Promise<DanceRecorderView> {
      return exclusive(signal, async () => {
        current(signal); release();
        if (original) return saveAndUpload(signal, stage);
        if (uploadSession) { stage("uploading"); return recoverUpload(signal); }
        return prepare(policyHash, signal);
      });
    },
    resume(sessionId: string, signal: AbortSignal): Promise<DanceRecorderView> {
      return exclusive(signal, async () => { release(); uploadSession = sessionId; return recoverUpload(signal); });
    },
    newAttempt(policyHash: string, signal: AbortSignal): Promise<DanceRecorderView> {
      return exclusive(signal, async () => {
        release(); await preparation.closeTerminal(signal); current(signal);
        original = null; uploadSession = null; ready = null;
        return prepare(policyHash, signal);
      });
    },
    pause() { release(); ready = null; },
    dispose() { disposed = true; release(); ready = null; original = null; },
  };
}
