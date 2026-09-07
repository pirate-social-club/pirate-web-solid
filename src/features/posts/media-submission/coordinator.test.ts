import { prepareSongComposer, submitSongComposer, restoreSongComposerTerms } from "../post-composer/media-composer-bridge";
import { describe, expect, test } from "bun:test";

import { ApiClientError, type PostCommunitiesCommunityIdMediaUploadReservationsResponse } from "@pirate/api-client";
import type { MediaSubmissionSnapshot } from "./contracts";
import { MediaSubmissionCoordinator } from "./coordinator";
import { createMemoryMediaSubmissionStorage, mediaCommandBody, type PersistedMediaCommand } from "./pending";
import { AmbiguousMediaSubmissionError, MediaSubmissionConflictError, type MediaCommandResult, type MediaSubmissionTransport } from "./transport";

const reservation: PostCommunitiesCommunityIdMediaUploadReservationsResponse = {
  reservation_id: "reservation-1",
  track: "song",
  slot: "primary_audio",
  status: "awaiting_upload",
  upload: { method: "PUT", url: "https://upload.test/object", required_headers: [{ name: "content-type", value: "audio/mpeg" }], expires_at: "2026-08-27T00:00:00Z" },
};

function snapshot(patch: Partial<MediaSubmissionSnapshot> = {}): MediaSubmissionSnapshot {
  const value = {
    submission_id: "sub-1",
    author_persona: { persona_id: "persona-author", object: "persona", display_name: null, avatar_ref: null, primary_public_handle: "author" },
    href: "/media-post-submissions/sub-1",
    track: "song",
    creation_revision: 1,
    audio_revision: 0,
    lyrics_state: { current: { status: "not_bound" } },
    updated_at: "2026-08-26T00:00:00Z",
    status: "processing",
    phase: "awaiting_upload",
    ...patch,
  };
  // SAFETY: the base fixture supplies every required snapshot field and each
  // test patch uses contract-owned partial fields to model a reachable state.
  return value as MediaSubmissionSnapshot;
}

interface DecodedTestCommand {
  readonly lyrics: string;
  readonly commercial_rev_share_bps?: unknown;
  readonly royalty_allocations?: unknown;
}

class FakeTransport implements MediaSubmissionTransport {
  snapshot: MediaSubmissionSnapshot | null = null;
  readonly events: string[] = [];
  readonly commands: PersistedMediaCommand[] = [];
  ambiguousReserveOnce = false;
  ambiguousStartOnce = false;
  ambiguousUploadOnce = false;
  ambiguousFinalizeOnce = false;
  conflictStartOnce = false;
  offline = false;

  async dispatch(command: PersistedMediaCommand): Promise<MediaCommandResult> {
    this.events.push(`dispatch:${command.kind}`);
    this.commands.push(command);
    if (command.kind === "reserve") {
      if (this.ambiguousReserveOnce) {
        this.ambiguousReserveOnce = false;
        throw new AmbiguousMediaSubmissionError();
      }
      return reservation;
    }
    if (command.kind === "start") {
      this.snapshot ??= snapshot();
      if (this.conflictStartOnce) {
        this.conflictStartOnce = false;
        throw new MediaSubmissionConflictError(new ApiClientError(
          { status: 409, code: "conflict", name: "IdempotencyConflict", retryable: false },
          { error: { code: "conflict", message: "conflict", retryable: false, details: { reason_code: "idempotency_conflict", submission_id: "sub-existing" } } },
        ));
      }
      if (this.ambiguousStartOnce) {
        this.ambiguousStartOnce = false;
        throw new AmbiguousMediaSubmissionError();
      }
      return this.snapshot;
    }
    if (this.snapshot === null) throw new Error("missing server submission");
    const decodedValue: unknown = JSON.parse(new TextDecoder().decode(await mediaCommandBody(command)));
    // SAFETY: mediaCommandBody already digest-checks bytes created from a
    // generated operation body; tests inspect only declared command fields.
    const decoded = decodedValue as DecodedTestCommand;
    if (command.kind === "finalize") {
      this.snapshot = snapshot({ creation_revision: this.snapshot.creation_revision, audio_revision: 1, phase: "analysis" });
      if (this.ambiguousFinalizeOnce) {
        this.ambiguousFinalizeOnce = false;
        throw new AmbiguousMediaSubmissionError();
      }
    } else if (command.kind === "terms") {
      this.snapshot = snapshot({ ...this.snapshot, creation_revision: this.snapshot.creation_revision + 1 });
    } else if (command.kind === "lyrics") {
      this.snapshot = snapshot({
        ...this.snapshot,
        creation_revision: this.snapshot.creation_revision + 1,
        audio_revision: 1,
        lyrics_state: {
          current: {
            status: "ready",
            text: decoded.lyrics,
            lyrics_revision: this.snapshot.creation_revision,
            audio_revision: 1,
          },
        },
      });
    } else if (command.kind === "cancel") {
      this.snapshot = snapshot({ ...this.snapshot, status: "abandoned", reason_code: "author_cancelled_before_finalize" });
    } else if (command.kind === "retry") {
      this.snapshot = snapshot({ ...this.snapshot, creation_revision: this.snapshot.creation_revision + 1, status: "processing", phase: "analysis" });
    }
    return this.snapshot;
  }

  async read(): Promise<MediaSubmissionSnapshot | null> {
    this.events.push("read");
    if (this.offline) throw new AmbiguousMediaSubmissionError("offline");
    return this.snapshot;
  }

  async upload(_reservation: PostCommunitiesCommunityIdMediaUploadReservationsResponse, audio: Blob, onProgress?: (sent: number, total: number) => void): Promise<void> {
    this.events.push("upload");
    if (this.ambiguousUploadOnce) {
      this.ambiguousUploadOnce = false;
      throw new AmbiguousMediaSubmissionError("upload failed before the browser observed a response");
    }
    onProgress?.(audio.size, audio.size);
  }
}

class HeldFinalizeTransport extends FakeTransport {
  private releaseFinalization!: () => void;
  readonly finalizationReleased = new Promise<void>(resolve => {
    this.releaseFinalization = resolve;
  });
  private markFinalizeStarted!: () => void;
  readonly finalizeStarted = new Promise<void>(resolve => {
    this.markFinalizeStarted = resolve;
  });

  constructor(private readonly returnStaleFinalizeResponse = false) {
    super();
  }

  releaseFinalize(): void {
    this.releaseFinalization();
  }

  override async dispatch(command: PersistedMediaCommand): Promise<MediaCommandResult> {
    if (command.kind !== "finalize") return super.dispatch(command);
    this.events.push("dispatch:finalize");
    this.commands.push(command);
    if (this.snapshot === null) throw new Error("missing server submission");
    const started = this.snapshot;
    this.snapshot = snapshot({
      status: "processing",
      creation_revision: started.creation_revision,
      audio_revision: 1,
      lyrics_state: started.lyrics_state,
      phase: "analysis",
    });
    const staleResponse = this.snapshot;
    this.markFinalizeStarted();
    await this.finalizationReleased;
    const current = this.snapshot;
    this.snapshot = snapshot({
      status: "published",
      creation_revision: current.creation_revision,
      audio_revision: current.audio_revision,
      lyrics_state: current.lyrics_state,
      published_resource: { post_id: "post-1", href: "/posts/post-1" },
    });
    return this.returnStaleFinalizeResponse ? staleResponse : this.snapshot;
  }
}

function coordinator(storage: ReturnType<typeof createMemoryMediaSubmissionStorage>, transport: FakeTransport, ids: string[]) {
  let index = 0;
  return new MediaSubmissionCoordinator({
    storage,
    transport,
    createId: () => ids[index++] ?? `key-${index}`,
    now: () => "2026-08-26T00:00:00Z",
  });
}

const beginInput = () => ({
  draftId: "draft-1",
  principalId: "account-1",
  communityId: "community-1",
  personaId: "persona-author",
  audio: new File([new Uint8Array([1, 2, 3])], "song.mp3", { type: "audio/mpeg", lastModified: 1 }),
  title: "Midnight Signal",
  songType: "original" as const,
  authorDeclaredRating: "adult_18" as const,
});

describe("media submission coordinator replay", () => {
  test("persists and sends the author-declared song rating", async () => {
    const storage = createMemoryMediaSubmissionStorage();
    const transport = new FakeTransport();
    const flow = coordinator(storage, transport, ["reserve-key", "start-key"]);
    await flow.begin(beginInput());

    expect(flow.currentRecord?.song_draft.author_declared_rating).toBe("adult_18");
    const start = transport.commands.find(command => command.kind === "start");
    expect(start).toBeDefined();
    expect(JSON.parse(new TextDecoder().decode(await mediaCommandBody(start!)))).toMatchObject({ author_declared_rating: "adult_18" });
  });

  test("binds reviewed lyrics once while finalization remains in flight", async () => {
    const storage = createMemoryMediaSubmissionStorage();
    const transport = new HeldFinalizeTransport();
    const observed: MediaSubmissionSnapshot[] = [];
    let idIndex = 0;
    const ids = ["reserve-key", "start-key", "finalize-key", "lyrics-key"];
    const flow = new MediaSubmissionCoordinator({
      storage,
      transport,
      createId: () => ids[idIndex++] ?? `unused-${idIndex}`,
      now: () => "2026-08-26T00:00:00Z",
      onSnapshotChange: value => observed.push(value),
    });
    await flow.begin(beginInput());

    const finalization = flow.uploadAndFinalize();
    await transport.finalizeStarted;
    await new Promise<void>(resolve => setTimeout(resolve, 300));
    expect(observed.some(value => value.audio_revision === 1)).toBe(true);

    const lyrics = await flow.bindLyrics("Reviewed words", "paste");
    expect(lyrics.lyrics_state.current).toMatchObject({
      status: "ready",
      text: "Reviewed words",
    });
    expect(transport.commands.filter(command => command.kind === "lyrics")).toHaveLength(1);

    transport.releaseFinalize();
    const published = await finalization;
    expect(published).toMatchObject({
      status: "published",
      lyrics_state: { current: { status: "ready", text: "Reviewed words" } },
    });

    const restored = coordinator(storage, transport, ["must-not-be-used"]);
    await restored.restore("draft-1");
    expect(transport.commands.filter(command => command.kind === "lyrics")).toHaveLength(1);
    expect(restored.currentRecord?.pending_command).toBeNull();
  });

  test("returns the retained lyrics snapshot when finalize responds with stale state", async () => {
    const storage = createMemoryMediaSubmissionStorage();
    const transport = new HeldFinalizeTransport(true);
    const observed: MediaSubmissionSnapshot[] = [];
    let idIndex = 0;
    const ids = ["reserve-key", "start-key", "finalize-key", "lyrics-key"];
    const flow = new MediaSubmissionCoordinator({
      storage,
      transport,
      createId: () => ids[idIndex++] ?? `unused-${idIndex}`,
      now: () => "2026-08-26T00:00:00Z",
      onSnapshotChange: value => observed.push(value),
    });
    await flow.begin(beginInput());

    const finalization = flow.uploadAndFinalize();
    await transport.finalizeStarted;
    await new Promise<void>(resolve => setTimeout(resolve, 300));
    await flow.bindLyrics("Newest reviewed words", "paste");
    transport.releaseFinalize();

    const retained = await finalization;
    expect(retained).toMatchObject({
      creation_revision: 2,
      lyrics_state: { current: { status: "ready", text: "Newest reviewed words" } },
    });
    expect(flow.currentRecord?.snapshot).toEqual(retained);
    expect(observed.at(-1)).toEqual(retained);
  });

  test("does not reopen a published no-lyrics submission", async () => {
    const storage = createMemoryMediaSubmissionStorage();
    const transport = new FakeTransport();
    const flow = coordinator(storage, transport, ["reserve-key", "start-key", "lyrics-key"]);
    await flow.begin(beginInput());
    transport.snapshot = snapshot({
      audio_revision: 1,
      lyrics_state: { current: { status: "no_lyrics" } },
      status: "published",
      published_resource: { post_id: "post-1", href: "/posts/post-1" },
    });

    await expect(flow.bindLyrics("Too late", "paste")).rejects.toThrow(
      "Lyrics cannot be bound before audio finalization",
    );
    expect(transport.commands.filter(command => command.kind === "lyrics")).toHaveLength(0);
  });

  test("replays one retained reservation key and continues the durable start after reconnect", async () => {
    const storage = createMemoryMediaSubmissionStorage();
    const transport = new FakeTransport();
    transport.ambiguousReserveOnce = true;
    await expect(coordinator(storage, transport, ["reserve-key"]).begin(beginInput())).rejects.toBeInstanceOf(AmbiguousMediaSubmissionError);
    const restored = coordinator(storage, transport, ["start-key"]);
    await restored.restore("draft-1");
    await restored.ensureStarted();
    expect(new Set(transport.commands.filter(command => command.kind === "reserve").map(command => command.idempotency_key))).toEqual(new Set(["reserve-key"]));
    expect(new Set(transport.commands.filter(command => command.kind === "start").map(command => command.idempotency_key))).toEqual(new Set(["start-key"]));
  });

  test("replays one retained start key after a lost response without creating a second reservation or command", async () => {
    const storage = createMemoryMediaSubmissionStorage();
    const transport = new FakeTransport();
    transport.ambiguousStartOnce = true;
    await expect(coordinator(storage, transport, ["reserve-key", "start-key"]).begin(beginInput())).rejects.toBeInstanceOf(AmbiguousMediaSubmissionError);
    const restored = coordinator(storage, transport, ["unused"]);
    await restored.restore("draft-1");
    const reserveCommands = transport.commands.filter(command => command.kind === "reserve");
    const startCommands = transport.commands.filter(command => command.kind === "start");
    expect(reserveCommands).toHaveLength(1);
    expect(new Set(startCommands.map(command => command.idempotency_key))).toEqual(new Set(["start-key"]));
    expect(restored.currentRecord?.submission_id).toBe("sub-1");
  });

  test("queries server state after refresh before replay and never sends a second finalize command", async () => {
    const storage = createMemoryMediaSubmissionStorage();
    const transport = new FakeTransport();
    const first = coordinator(storage, transport, ["reserve-key", "start-key", "finalize-key"]);
    await first.begin(beginInput());
    transport.ambiguousFinalizeOnce = true;
    await expect(first.uploadAndFinalize()).rejects.toBeInstanceOf(AmbiguousMediaSubmissionError);
    const finalizeCount = transport.commands.filter(command => command.kind === "finalize").length;
    const restored = coordinator(storage, transport, ["unused"]);
    await restored.restore("draft-1");
    expect(transport.commands.filter(command => command.kind === "finalize")).toHaveLength(finalizeCount);
    expect(restored.currentRecord?.upload_status).toBe("sealed");
    expect(restored.state).toMatchObject({ status: "processing", phase: "analysis" });
  });

  test("returns an ambiguous browser upload to awaiting-upload so the retained PUT can be retried", async () => {
    const storage = createMemoryMediaSubmissionStorage();
    const transport = new FakeTransport();
    const flow = coordinator(storage, transport, ["reserve-key", "start-key", "finalize-key"]);
    await flow.begin(beginInput());
    transport.ambiguousUploadOnce = true;

    await expect(flow.uploadAndFinalize()).rejects.toBeInstanceOf(AmbiguousMediaSubmissionError);

    expect(flow.state).toEqual({ status: "processing", submissionId: "sub-1", phase: "awaiting_upload" });
    expect(flow.currentRecord?.upload_status).toBe("uploading");

    const result = await flow.uploadAndFinalize();
    expect(result).toMatchObject({ status: "processing", phase: "analysis", audio_revision: 1 });
    expect(transport.events.filter(event => event === "upload")).toHaveLength(2);
    expect(transport.commands.filter(command => command.kind === "finalize")).toHaveLength(1);
  });

  test("persists a typed idempotency conflict and never auto-rekeys it", async () => {
    const storage = createMemoryMediaSubmissionStorage();
    const transport = new FakeTransport();
    transport.conflictStartOnce = true;
    const flow = coordinator(storage, transport, ["reserve-key", "start-key", "must-not-be-used"]);
    await expect(flow.begin(beginInput())).rejects.toBeInstanceOf(MediaSubmissionConflictError);
    expect(flow.currentRecord?.issue).toEqual({ kind: "idempotency_conflict", submission_id: "sub-existing" });
    expect(new Set(transport.commands.filter(command => command.kind === "start").map(command => command.idempotency_key))).toEqual(new Set(["start-key"]));
  });

  test("keeps an offline refresh reconciling and resumes on reconnect", async () => {
    const storage = createMemoryMediaSubmissionStorage();
    const transport = new FakeTransport();
    const first = coordinator(storage, transport, ["reserve-key", "start-key"]);
    await first.begin(beginInput());
    transport.offline = true;
    const restored = coordinator(storage, transport, ["unused"]);
    await restored.restore("draft-1");
    expect(restored.state).toMatchObject({ status: "reconciling", submissionId: "sub-1" });
    transport.offline = false;
    await restored.refresh();
    expect(restored.state).toMatchObject({ status: "processing", phase: "awaiting_upload" });
  });

  test("queries current revision before terms and serializes recipient ids without wallets", async () => {
    const storage = createMemoryMediaSubmissionStorage();
    const transport = new FakeTransport();
    const flow = coordinator(storage, transport, ["reserve-key", "start-key", "terms-key"]);
    await flow.begin(beginInput());
    transport.events.length = 0;
    await flow.bindTerms({ licensePreset: "commercial-remix", commercialRevShareBps: 1_025, allocations: [{ recipientId: "persona-author", shareBps: 10_000 }] });
    expect(transport.events.slice(0, 2)).toEqual(["read", "dispatch:terms"]);
    const terms = transport.commands.find(command => command.kind === "terms")!;
    const bodyValue: unknown = JSON.parse(new TextDecoder().decode(await mediaCommandBody(terms)));
    // SAFETY: mediaCommandBody verifies the retained generated-command bytes.
    const body = bodyValue as DecodedTestCommand;
    expect(body).toMatchObject({ commercial_rev_share_bps: 1_025, royalty_allocations: [{ recipient_id: "persona-author", share_bps: 10_000 }] });
    expect(JSON.stringify(body)).not.toContain("wallet");
  });

  test("supports author-pasted lyrics, corrections, lyrics-free refresh, and cancellation", async () => {
    const storage = createMemoryMediaSubmissionStorage();
    const transport = new FakeTransport();
    const flow = coordinator(storage, transport, ["reserve-key", "start-key", "lyrics-paste", "lyrics-correct", "cancel-key"]);
    await flow.begin(beginInput());
    transport.snapshot = snapshot({ audio_revision: 1, phase: "analysis", lyrics_state: { current: { status: "not_bound" } } });
    await flow.bindLyrics("Pasted words", "paste");
    await flow.bindLyrics("Correct words", "correct");
    const lyricCommands = transport.commands.filter(command => command.kind === "lyrics");
    const lyricBodies = await Promise.all(lyricCommands.map(async command => {
      const value: unknown = JSON.parse(new TextDecoder().decode(await mediaCommandBody(command)));
      // SAFETY: mediaCommandBody verifies the retained generated-command bytes.
      return value as DecodedTestCommand;
    }));
    expect(lyricBodies.map(body => body.lyrics)).toEqual(["Pasted words", "Correct words"]);
    expect(lyricBodies.every(body => !("base_transcript_revision" in body))).toBe(true);

    transport.snapshot = snapshot({ audio_revision: 1, phase: "analysis", lyrics_state: { current: { status: "no_lyrics" } } });
    await flow.refresh();
    expect(flow.currentRecord?.snapshot?.lyrics_state.current.status).toBe("no_lyrics");

    // A sealed revision cannot move back to awaiting_upload. Cancellation
    // remains available on a distinct submission that has not been finalized.
    const cancelTransport = new FakeTransport();
    const cancellable = coordinator(createMemoryMediaSubmissionStorage(), cancelTransport, ["reserve", "start", "cancel"]);
    await cancellable.begin(beginInput());
    await cancellable.cancel();
    expect(cancellable.state.status).toBe("abandoned");
  });
});

function bridgeInput(flow: MediaSubmissionCoordinator) {
  const begin = beginInput();
  return { coordinator: flow, draftId: begin.draftId, principalId: begin.principalId,
    communityId: begin.communityId, personaId: begin.personaId, songMode: begin.songType,
    authorDeclaredRating: begin.authorDeclaredRating, song: { primaryAudioUpload: begin.audio, title: begin.title },
    license: { presetId: "commercial-remix" as const, commercialRevShareBps: 1_234 },
    royaltySplit: { allocations: [
      { id: "creator", recipientKind: "creator" as const, recipientId: begin.personaId, shareBps: 7_500, sharePct: 75 },
      { id: "collaborator", recipientKind: "collaborator" as const, recipientId: "persona-collaborator", shareBps: 2_500, sharePct: 25 },
    ] }, lyrics: "Reviewed song words" };
}

test("preparation holds terms; final publish binds reviewed lyrics first and restores exact shares", async () => {
  const storage = createMemoryMediaSubmissionStorage();
  const transport = new FakeTransport();
  const flow = coordinator(storage, transport, ["reserve", "start", "finalize", "lyrics", "terms"]);
  const input = bridgeInput(flow);
  await prepareSongComposer(input);
  expect(transport.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize"]);
  await submitSongComposer(input);
  expect(transport.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize", "lyrics", "terms"]);
  const restored = await restoreSongComposerTerms(flow.currentRecord!);
  expect(restored?.license).toEqual(input.license);
  expect(restored?.royaltySplit.allocations.map(({ recipientId, shareBps }) => ({ recipientId, shareBps })))
    .toEqual([{ recipientId: "persona-author", shareBps: 7_500 }, { recipientId: "persona-collaborator", shareBps: 2_500 }]);
  await submitSongComposer(input);
  expect(transport.commands).toHaveLength(5);
});

test("invalid fixture-only allocations fail before a reservation is made", async () => {
  const transport = new FakeTransport();
  const input = bridgeInput(coordinator(createMemoryMediaSubmissionStorage(), transport, []));
  await expect(submitSongComposer({ ...input, royaltySplit: { allocations: [
    { id: "creator", recipientKind: "creator", sharePct: 100 },
  ] } })).rejects.toThrow("recipient id and integer basis-point share");
  expect(transport.commands).toHaveLength(0);
});

test("ambiguous lyrics never release terms and retry retains the accepted lyrics command", async () => {
  class LostLyricsResponse extends FakeTransport {
    first = true;
    override async dispatch(command: PersistedMediaCommand) {
      const result = await super.dispatch(command);
      if (command.kind === "lyrics" && this.first) { this.first = false; throw new AmbiguousMediaSubmissionError(); }
      return result;
    }
  }
  const transport = new LostLyricsResponse();
  const storage = createMemoryMediaSubmissionStorage();
  const flow = coordinator(storage, transport, ["reserve", "start", "finalize", "lyrics", "terms"]);
  await expect(submitSongComposer(bridgeInput(flow))).rejects.toBeInstanceOf(AmbiguousMediaSubmissionError);
  expect(transport.commands.some(command => command.kind === "terms")).toBe(false);
  const restored = coordinator(storage, transport, ["terms"]);
  await restored.restore("draft-1");
  await submitSongComposer(bridgeInput(restored));
  expect(transport.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize", "lyrics", "terms"]);
});

test("reference recovery replays exact request bytes after an ambiguous response", async () => {
  class LostReferenceResponse extends FakeTransport {
    first = true;
    override async dispatch(command: PersistedMediaCommand) {
      if (command.kind !== "reference") return super.dispatch(command);
      this.commands.push(command);
      if (this.first) { this.first = false; throw new AmbiguousMediaSubmissionError(); }
      this.snapshot = snapshot({ creation_revision: 4, audio_revision: 1, phase: "analysis" });
      return this.snapshot;
    }
  }
  const storage = createMemoryMediaSubmissionStorage();
  const transport = new LostReferenceResponse();
  const flow = coordinator(storage, transport, ["reserve", "start", "reference"]);
  await flow.begin(beginInput());
  transport.snapshot = snapshot({ status: "action_required", creation_revision: 3, audio_revision: 1,
    action: { kind: "reference_required", reference_request_ref: "request-1", expires_at: "2099-01-01T00:00:00Z" } });
  await expect(flow.bindReference("asset-source")).rejects.toBeInstanceOf(AmbiguousMediaSubmissionError);
  const restored = coordinator(storage, transport, ["must-not-be-used"]);
  await restored.restore("draft-1");
  const references = transport.commands.filter(command => command.kind === "reference");
  expect(references).toHaveLength(2);
  expect(references[0]).toEqual(references[1]);
  expect(JSON.parse(new TextDecoder().decode(await mediaCommandBody(references[0]!))))
    .toMatchObject({ persona_id: "persona-author", expected_creation_revision: 3, reference_request_ref: "request-1", upstream_asset_id: "asset-source" });
});
