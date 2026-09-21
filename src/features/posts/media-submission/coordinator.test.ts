import { afterEach, describe, expect, test, vi } from "vitest";

import type { PostCommunitiesCommunityIdMediaUploadReservationsResponse } from "@pirate/api-client";

import type { ActiveSongMediaPostSubmission, MediaSubmissionSnapshot } from "./contracts";
import { projectActiveSongIntoComposer, submitSongComposer } from "../post-composer/media-composer-bridge";
import {
  createMediaSubmissionCoordinator,
  type MediaSubmissionCoordinator,
} from "./coordinator";
import { mediaCommandBody, type PersistedMediaCommand } from "./pending";
import {
  MediaSubmissionConflictError,
  RejectedMediaSubmissionError,
  type MediaCommandResult,
  type MediaSubmissionTransport,
} from "./transport";

const reservation: PostCommunitiesCommunityIdMediaUploadReservationsResponse = {
  reservation_id: "reservation-1",
  track: "song",
  slot: "primary_audio",
  status: "awaiting_upload",
  upload: {
    method: "PUT",
    url: "https://upload.test/song",
    required_headers: [{ name: "content-type", value: "audio/mpeg" }],
    expires_at: "2099-01-01T00:00:00Z",
  },
};

function snapshot(patch: Partial<MediaSubmissionSnapshot> = {}): MediaSubmissionSnapshot {
  const base = {
    submission_id: "submission-1",
    author_persona: { persona_id: "persona-one", object: "persona", display_name: "Persona One", avatar_ref: null, primary_public_handle: null },
    href: "/media-post-submissions/submission-1",
    track: "song",
    creation_revision: 1,
    audio_revision: 0,
    lyrics_state: { current: { status: "not_bound" } },
    updated_at: "2026-09-12T00:00:00Z",
    status: "processing",
    phase: "awaiting_upload",
    ...patch,
  };
  // SAFETY: the base supplies every generated processing field and patches
  // only add or replace fields belonging to reachable variants.
  return base as MediaSubmissionSnapshot;
}

function conflict(): MediaSubmissionConflictError {
  // SAFETY: the transport constructor reads only declaredName and details
  // from its argument; this fixtures models an untyped command conflict.
  const apiError = Object.assign(new Error("command conflict"), {
    declaredName: "Conflict",
    details: undefined,
  }) as never;
  return new MediaSubmissionConflictError(apiError);
}

function rejected(): RejectedMediaSubmissionError {
  // SAFETY: the transport error wrapper reads the stable Error message and
  // numeric status fields supplied by this definitive-rejection fixture.
  const apiError = Object.assign(new Error("request rejected"), { status: 400 }) as never;
  return new RejectedMediaSubmissionError(apiError);
}

interface MediaCommandBodyShape {
  readonly lyrics?: string;
  readonly expected_audio_revision?: number;
  readonly persona_id?: string;
}

async function commandBody(command: PersistedMediaCommand): Promise<MediaCommandBodyShape> {
  // SAFETY: mediaCommandBody digest-checks the retained generated request
  // bytes; this fixture reads only the closed scalar fields it asserts on.
  return JSON.parse(new TextDecoder().decode(await mediaCommandBody(command))) as MediaCommandBodyShape;
}

class MemoryMediaTransport implements MediaSubmissionTransport {
  async listActive() { return { object: "active_song_media_post_submission_page" as const, items: [], next_cursor: null }; }
  readonly kinds: string[] = [];
  readonly commands: PersistedMediaCommand[] = [];
  onDispatch: ((kind: PersistedMediaCommand["kind"]) => void) | null = null;
  uploadCount = 0;
  failOnce: string | null = null;
  conflictOnce: string | null = null;
  rejectOnce: string | null = null;
  finalizeDelayed = false;
  current: MediaSubmissionSnapshot | null = null;

  async dispatch(command: PersistedMediaCommand): Promise<MediaCommandResult> {
    this.kinds.push(command.kind);
    this.commands.push(command);
    this.onDispatch?.(command.kind);
    if (this.failOnce === command.kind) {
      this.failOnce = null;
      throw new Error(`ambiguous ${command.kind}`);
    }
    if (this.conflictOnce === command.kind) {
      this.conflictOnce = null;
      throw conflict();
    }
    if (this.rejectOnce === command.kind) {
      this.rejectOnce = null;
      throw rejected();
    }
    if (command.kind === "reserve") return reservation;
    if (command.kind === "start") {
      this.current = snapshot();
      return this.current;
    }
    if (this.current === null) throw new Error("missing submission");
    if (command.kind === "terms") {
      // SAFETY: current is a processing snapshot; the patch only advances a
      // revision field every processing variant carries.
      const advanced = { ...this.current, creation_revision: this.current.creation_revision + 1 } as Partial<MediaSubmissionSnapshot>;
      this.current = snapshot(advanced);
    } else if (command.kind === "finalize") {
      if (this.finalizeDelayed) {
        await new Promise(() => {});
      }
      // SAFETY: current is a processing snapshot; finalize sets the audio
      // revision and phase, which every processing variant carries.
      const finalized = { ...this.current, audio_revision: 1, phase: "analysis" } as Partial<MediaSubmissionSnapshot>;
      this.current = snapshot(finalized);
    } else if (command.kind === "lyrics") {
      const body = await commandBody(command);
      const creationRevision = this.current.creation_revision + 1;
      this.current = snapshot({
        ...this.current,
        creation_revision: creationRevision,
        audio_revision: 1,
        lyrics_state: {
          current: { status: "ready", text: String(body.lyrics), lyrics_revision: creationRevision, audio_revision: 1 },
        },
      });
    } else if (command.kind === "reference") {
      this.current = snapshot({ ...this.current, status: "processing", phase: "analysis" });
    } else if (command.kind === "cancel") {
      this.current = snapshot({
        ...this.current,
        status: "abandoned",
        reason_code: "author_cancelled_before_finalize",
      });
    }
    return this.current;
  }

  async read(): Promise<MediaSubmissionSnapshot | null> {
    return this.current;
  }

  async upload(
    _reservation: PostCommunitiesCommunityIdMediaUploadReservationsResponse,
    _audio: Blob,
    _onProgress?: (sent: number, total: number) => void,
    _signal?: AbortSignal,
  ): Promise<void> {
    this.uploadCount += 1;
  }
}

async function started(transport: MemoryMediaTransport): Promise<MediaSubmissionCoordinator> {
  const coordinator = createMediaSubmissionCoordinator({ transport, createId: () => crypto.randomUUID() });
  await coordinator.begin({
    communityId: "community-1",
    personaId: "persona-one",
    audio: new File([new Uint8Array([1, 2, 3])], "song.mp3", { type: "audio/mpeg" }),
    title: "Signal",
    songType: "original",
    authorDeclaredRating: "general",
  });
  return coordinator;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("media submission coordinator", () => {
  test("recovers only server state and does not repeat upload or bound terms", async () => {
    const transport = new MemoryMediaTransport();
    transport.current = snapshot({ audio_revision: 1, phase: "analysis", creation_revision: 3,
      lyrics_state: { current: { status: "ready", text: "Accepted lyrics", lyrics_revision: 1, audio_revision: 1 } } });
    const item: ActiveSongMediaPostSubmission = { object: "active_song_media_post_submission",
      community_id: "community-1", title: "Server title", song_type: "remix", author_declared_rating: "adult_18",
      terms_state: { current: { status: "ready", license_preset: "commercial-remix", commercial_rev_share_bps: 1250,
        access_mode: "public", royalty_allocations: [{ recipient_id: "persona-one", share_bps: 7500 }, { recipient_id: "collaborator", share_bps: 2500 }] } },
      submission: transport.current };
    const coordinator = createMediaSubmissionCoordinator({ transport });
    coordinator.recover(item);
    expect(coordinator.termsIssued).toBe(true);
    expect(coordinator.currentRecord).toMatchObject({ audio: null, reservation: null, pending_command: null, commands: [] });
    const projection = projectActiveSongIntoComposer(item);
    expect(projection).toMatchObject({ personaId: "persona-one", songMode: "remix", ageGatePolicy: "18_plus",
      song: { title: "Server title", primaryAudioUpload: null }, lyrics: "Accepted lyrics",
      license: { presetId: "commercial-remix", commercialRevShareBps: 1250 },
      royaltySplit: { allocations: [{ recipientKind: "creator", shareBps: 7500 }, { recipientKind: "collaborator", shareBps: 2500 }] } });
    await submitSongComposer({ ...projection, coordinator, communityId: "community-1", authorDeclaredRating: "adult_18" });
    expect(transport.kinds).toEqual([]);
    expect(transport.uploadCount).toBe(0);
  });

  test("recovered unfinished upload requires cancel and never recreates a file", async () => {
    const transport = new MemoryMediaTransport();
    transport.current = snapshot();
    const coordinator = createMediaSubmissionCoordinator({ transport });
    coordinator.recover({ object: "active_song_media_post_submission", community_id: "community-1",
      title: "Unfinished upload", song_type: "original", author_declared_rating: "general",
      terms_state: { current: { status: "not_bound" } }, submission: transport.current });
    expect(coordinator.recoveredUploadUnavailable).toBe(true);
    await expect(coordinator.uploadAndFinalize()).rejects.toThrow("The original audio file and upload reservation are no longer available");
    expect(transport.uploadCount).toBe(0);
    expect((await coordinator.cancel()).status).toBe("abandoned");
    expect(transport.kinds).toEqual(["cancel"]);
  });

  test("runs one reserve, start, upload, and finalize for an ordinary song", async () => {
    const transport = new MemoryMediaTransport();
    const coordinator = createMediaSubmissionCoordinator({ transport });
    await coordinator.begin({
      communityId: "community-1",
      personaId: "persona-one",
      audio: new File([new Uint8Array([1, 2, 3])], "song.mp3", { type: "audio/mpeg" }),
      title: "Signal",
      songType: "original",
      authorDeclaredRating: "general",
    });
    const finalized = await coordinator.uploadAndFinalize();
    expect(finalized.audio_revision).toBe(1);
    expect(transport.kinds).toEqual(["reserve", "start", "finalize"]);
    expect(transport.uploadCount).toBe(1);
    expect(coordinator.currentRecord?.upload_status).toBe("sealed");
  });

  test("rejects oversized audio before retaining a command and accepts a smaller replacement", async () => {
    const transport = new MemoryMediaTransport();
    const coordinator = createMediaSubmissionCoordinator({ transport });
    const oversized = new File([new Uint8Array([1])], "large.mp3", { type: "audio/mpeg" });
    Object.defineProperty(oversized, "size", { value: 64 * 1024 * 1024 + 1 });
    await expect(coordinator.begin({
      communityId: "community-1",
      personaId: "persona-one",
      audio: oversized,
      title: "Too large",
      songType: "original",
      authorDeclaredRating: "general",
    })).rejects.toThrow("Song audio must be 64 MiB or smaller.");
    expect(coordinator.currentRecord).toBeNull();
    expect(transport.commands).toHaveLength(0);

    await coordinator.begin({
      communityId: "community-1",
      personaId: "persona-one",
      audio: new File([new Uint8Array([1])], "smaller.mp3", { type: "audio/mpeg" }),
      title: "Smaller",
      songType: "original",
      authorDeclaredRating: "general",
    });
    expect(transport.kinds).toEqual(["reserve", "start"]);
  });

  test("drops a definitively rejected reserve so corrected input starts a new operation", async () => {
    const transport = new MemoryMediaTransport();
    const coordinator = createMediaSubmissionCoordinator({ transport });
    transport.rejectOnce = "reserve";
    const input = {
      communityId: "community-1",
      personaId: "persona-one",
      audio: new File([new Uint8Array([1])], "song.mp3", { type: "audio/mpeg" }),
      title: "Signal",
      songType: "original" as const,
      authorDeclaredRating: "general" as const,
    };
    await expect(coordinator.begin(input)).rejects.toBeInstanceOf(RejectedMediaSubmissionError);
    expect(coordinator.currentRecord).toBeNull();

    await coordinator.begin({ ...input, title: "Corrected signal" });
    expect(transport.kinds).toEqual(["reserve", "reserve", "start"]);
  });

  test("replays the exact retained start command after an ambiguous response", async () => {
    const transport = new MemoryMediaTransport();
    const coordinator = createMediaSubmissionCoordinator({ transport });
    transport.failOnce = "start";
    await expect(coordinator.begin({
      communityId: "community-1",
      personaId: "persona-one",
      audio: new File([new Uint8Array([1, 2, 3])], "song.mp3", { type: "audio/mpeg" }),
      title: "Signal",
      songType: "original",
      authorDeclaredRating: "general",
    })).rejects.toThrow("ambiguous start");

    await coordinator.uploadAndFinalize();
    expect(transport.kinds).toEqual(["reserve", "start", "start", "finalize"]);
    const starts = transport.commands.filter(command => command.kind === "start");
    expect(starts).toHaveLength(2);
    expect(starts[1]!.idempotency_key).toBe(starts[0]!.idempotency_key);
    expect(starts[1]!.body_sha256).toBe(starts[0]!.body_sha256);
    expect(transport.kinds.filter(kind => kind === "reserve")).toHaveLength(1);
  });

  test("retries an ambiguous upload with the same reservation and one finalize", async () => {
    const transport = new MemoryMediaTransport();
    const coordinator = await started(transport);
    let first = true;
    const originalUpload = transport.upload.bind(transport);
    transport.upload = async (...input) => {
      if (first) { first = false; throw new Error("upload uncertain"); }
      await originalUpload(...input);
    };
    await expect(coordinator.uploadAndFinalize()).rejects.toThrow("upload uncertain");
    const finalized = await coordinator.uploadAndFinalize();
    expect(finalized.audio_revision).toBe(1);
    expect(transport.uploadCount).toBe(1);
    expect(transport.kinds.filter(kind => kind === "finalize")).toHaveLength(1);
  });

  test("restores a retryable retained upload after caller cancellation", async () => {
    const transport = new MemoryMediaTransport();
    const coordinator = await started(transport);
    const entered = Promise.withResolvers<void>();
    transport.upload = async (_reservation, audio, onProgress, signal) => {
      transport.uploadCount += 1;
      onProgress?.(1, audio.size);
      entered.resolve();
      await new Promise<void>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("upload stopped")), {
          once: true,
        });
      });
    };
    const controller = new AbortController();
    const upload = coordinator.uploadAndFinalize(undefined, controller.signal);
    await entered.promise;
    expect(coordinator.state).toEqual({
      status: "uploading",
      submissionId: "submission-1",
      bytesSent: 1,
      bytesTotal: 3,
    });
    controller.abort();

    await expect(upload).rejects.toThrow("upload stopped");
    expect(coordinator.currentRecord?.upload_status).toBe("not_uploaded");
    expect(coordinator.state).toMatchObject({ status: "processing", phase: "awaiting_upload" });
    expect(transport.kinds).not.toContain("finalize");
  });

  test("refuses an expired upload URL and preserves the cancel-and-restart path", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2100-01-01T00:00:00Z"));
    const transport = new MemoryMediaTransport();
    const coordinator = await started(transport);
    await expect(coordinator.uploadAndFinalize()).rejects.toThrow(
      "The upload reservation expired. Cancel this submission and start again.",
    );
    expect(transport.uploadCount).toBe(0);
    await expect(coordinator.cancel()).resolves.toMatchObject({ status: "abandoned" });
    coordinator.discardTerminal();
    expect(coordinator.currentRecord).toBeNull();
  });

  test("drops a conflicting command so a later action starts from the snapshot", async () => {
    const transport = new MemoryMediaTransport();
    const coordinator = await started(transport);
    await coordinator.uploadAndFinalize();
    transport.conflictOnce = "terms";
    await expect(coordinator.bindTerms({
      licensePreset: "non-commercial",
      allocations: [{ recipientId: "persona-one", shareBps: 10_000 }],
    })).rejects.toBeInstanceOf(MediaSubmissionConflictError);
    expect(coordinator.currentRecord?.pending_command).toBeNull();
    expect(coordinator.currentRecord?.commands.some(command => command.kind === "terms")).toBe(false);

    await coordinator.bindTerms({
      licensePreset: "non-commercial",
      allocations: [{ recipientId: "persona-one", shareBps: 10_000 }],
    });
    const terms = transport.commands.filter(command => command.kind === "terms");
    expect(terms).toHaveLength(2);
    expect(terms[1]!.idempotency_key).not.toBe(terms[0]!.idempotency_key);
  });

  test("binds lyrics with the audio and creation revision fences", async () => {
    const transport = new MemoryMediaTransport();
    const coordinator = await started(transport);
    await coordinator.uploadAndFinalize();
    const bound = await coordinator.bindLyrics("Reviewed words", "paste");
    expect(bound.lyrics_state.current).toMatchObject({ status: "ready", text: "Reviewed words" });
    const lyrics = transport.commands.find(command => command.kind === "lyrics")!;
    expect(await commandBody(lyrics)).toMatchObject({
      lyrics: "Reviewed words",
      expected_audio_revision: 1,
      persona_id: "persona-one",
    });
  });

  test("retries and cancels only the states the contract allows", async () => {
    const transport = new MemoryMediaTransport();
    const coordinator = await started(transport);
    // SAFETY: the base snapshot is a processing variant; this patch selects
    // the retryable failure variant the test drives.
    const failed = {
      status: "processing_failed",
      phase: undefined,
      reason_code: "publication_failed",
      retry_count: 1,
      retryable: true,
    } as Partial<MediaSubmissionSnapshot>;
    transport.current = snapshot(failed);
    await expect(coordinator.retry()).resolves.toMatchObject({ status: "processing_failed" });
    expect(transport.kinds).toContain("retry");
    expect(transport.kinds).not.toContain("cancel");

    transport.current = snapshot();
    await expect(coordinator.cancel()).resolves.toMatchObject({ status: "abandoned" });
    expect(transport.kinds).toContain("cancel");
  });

  test("reads a delayed finalize result instead of issuing a second command", async () => {
    vi.useFakeTimers();
    const transport = new MemoryMediaTransport();
    const coordinator = await started(transport);
    transport.finalizeDelayed = true;
    let resolveFinalizeDispatch: (() => void) | undefined;
    const finalizeDispatched = new Promise<void>(resolve => { resolveFinalizeDispatch = resolve; });
    transport.onDispatch = kind => {
      if (kind === "finalize") resolveFinalizeDispatch?.();
    };
    const finalizing = coordinator.uploadAndFinalize();
    // Wait until the command owns the delayed response before advancing the
    // observation clock. Without this barrier, a slower CI worker can advance
    // fake time before uploadAndFinalize schedules its first 250 ms tick.
    await finalizeDispatched;
    await vi.advanceTimersByTimeAsync(0);
    transport.current = snapshot({ audio_revision: 1, phase: "analysis" });
    await vi.advanceTimersByTimeAsync(300);
    const finalized = await finalizing;
    expect(finalized.audio_revision).toBe(1);
    expect(transport.kinds.filter(kind => kind === "finalize")).toHaveLength(1);
  });

  test("clears only a terminal operation", async () => {
    const transport = new MemoryMediaTransport();
    const coordinator = await started(transport);
    expect(() => coordinator.discardTerminal()).toThrow("Only a terminal media submission");
    // SAFETY: the base snapshot is a processing variant; this patch replaces
    // its status with the published variant read() would return.
    const published = {
      ...snapshot(),
      status: "published",
      published_resource: { post_id: "post-1", href: "/posts/post-1" },
    } as MediaSubmissionSnapshot;
    transport.current = published;
    await coordinator.refresh();
    coordinator.discardTerminal();
    expect(coordinator.currentRecord).toBeNull();
    expect(coordinator.state).toEqual({ status: "editing" });
  });

  test("allows a non-retryable processing failure to be discarded", async () => {
    const transport = new MemoryMediaTransport();
    const coordinator = await started(transport);
    // SAFETY: the base snapshot is a processing variant; this patch selects
    // the non-retryable failure variant returned by the API.
    transport.current = snapshot({
      status: "processing_failed",
      phase: undefined,
      reason_code: "workflow_terminal_unconverged",
      retry_count: 0,
      retryable: false,
    } as Partial<MediaSubmissionSnapshot>);
    await coordinator.refresh();
    coordinator.discardTerminal();
    expect(coordinator.currentRecord).toBeNull();
    expect(coordinator.state).toEqual({ status: "editing" });
  });
});
