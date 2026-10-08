import { describe, expect, it, vi } from "vitest";

import type { MediaSubmissionSnapshot } from "../media-submission/contracts";
import type { SongSubmissionView } from "../media-submission/projection";
import { songStageIndex, SONG_PROCESSING_PHASES } from "./pending-songs";
import { createSongSubmissionStore, type SongSubmissionHandover } from "./song-submission-store";

type Phase = Extract<SongSubmissionView, { status: "processing" }>["phase"];

/** A server answer carrying only what the observer's projection reads. */
const snapshot = (fields: object): MediaSubmissionSnapshot => JSON.parse(JSON.stringify(fields));
const processing = (phase: Phase) => snapshot({ status: "processing", submission_id: "song-1", phase });
const published = snapshot({ status: "published", submission_id: "song-1", published_resource: { post_id: "post-1", href: "/posts/song-1" } });
const failed = (retryable: boolean) => snapshot({ status: "processing_failed", submission_id: "song-1", reason_code: "analysis_failed", retryable });

function handover(source: SongSubmissionHandover["source"], accountId = "account-one"): SongSubmissionHandover {
  return {
    submissionId: "song-1",
    accountId,
    communityId: "community-1",
    title: "Midnight Waves",
    view: { status: "processing", submissionId: "song-1", phase: "finalize" },
    source,
  };
}

const viewOf = (store: ReturnType<typeof createSongSubmissionStore>) => store.items()[0]?.view;

describe("song submission store", () => {
  it("follows a song through its stages to publication", async () => {
    const answers = [processing("analysis"), processing("decision"), processing("publish"), published];
    const refresh = vi.fn(async () => answers.shift() ?? published);
    const store = createSongSubmissionStore({ observeIntervalMs: 5 });
    store.adopt(handover({ refresh, retry: vi.fn() }));
    const seen: number[] = [];
    await vi.waitFor(() => {
      const view = viewOf(store);
      const stage = view === undefined ? null : songStageIndex(view);
      if (stage !== null && seen.at(-1) !== stage) seen.push(stage);
      expect(view?.status).toBe("published");
    });
    // Stages only move forward, and each names something the server is doing.
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    for (const stage of seen) expect(stage).toBeLessThan(SONG_PROCESSING_PHASES);
    const reads = refresh.mock.calls.length;
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(refresh.mock.calls.length).toBe(reads);
    store.dispose();
  });

  it("does not turn an unanswered read into a failure of the song", async () => {
    const refresh = vi.fn(async () => { throw new Error("offline"); });
    const store = createSongSubmissionStore({ observeIntervalMs: 2 });
    store.adopt(handover({ refresh, retry: vi.fn() }));
    await vi.waitFor(() => expect(store.items()[0]?.slow).toBe(true));
    expect(viewOf(store)).toEqual({ status: "processing", submissionId: "song-1", phase: "finalize" });
    store.dispose();
  });

  it("bounds reads that never settle and aborts them when the observer leaves", async () => {
    const signals: AbortSignal[] = [];
    let resolveOld: ((value: MediaSubmissionSnapshot) => void) | undefined;
    const refresh = vi.fn((signal?: AbortSignal) => {
      if (signal !== undefined) signals.push(signal);
      return new Promise<MediaSubmissionSnapshot>(resolve => { resolveOld ??= resolve; });
    });
    const store = createSongSubmissionStore({ observeIntervalMs: 2, requestTimeoutMs: 5 });
    store.adopt(handover({ refresh, retry: vi.fn() }));
    await vi.waitFor(() => expect(store.items()[0]?.slow).toBe(true));
    expect(signals.filter(signal => signal.aborted).length).toBeGreaterThanOrEqual(3);
    expect(viewOf(store)?.status).toBe("processing");
    resolveOld?.(published);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(viewOf(store)?.status).toBe("processing");
    store.pause();
    const reads = refresh.mock.calls.length;
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(refresh).toHaveBeenCalledTimes(reads);
    expect(signals.every(signal => signal.aborted)).toBe(true);
    store.dispose();
  });

  it("reads after a rerun that never settles, without replaying that command", async () => {
    const refresh = vi.fn().mockResolvedValueOnce(failed(true)).mockResolvedValue(processing("analysis"));
    let retrySignal: AbortSignal | undefined;
    const retry = vi.fn((signal?: AbortSignal) => { retrySignal = signal; return new Promise<MediaSubmissionSnapshot>(() => {}); });
    const store = createSongSubmissionStore({ observeIntervalMs: 10, requestTimeoutMs: 5 });
    store.adopt(handover({ refresh, retry }));
    await vi.waitFor(() => expect(viewOf(store)?.status).toBe("processing_failed"));
    store.retry("song-1");
    await vi.waitFor(() => expect(viewOf(store)?.status).toBe("processing"));
    expect(retry).toHaveBeenCalledOnce();
    expect(retrySignal?.aborted).toBe(true);
    expect(store.items()[0]?.rerunning).toBe(false);
    store.dispose();
  });

  it("stops at a processing failure and runs it again only when asked", async () => {
    let rerun = false;
    const refresh = vi.fn(async () => rerun ? published : failed(true));
    const retry = vi.fn(async () => { rerun = true; return processing("analysis"); });
    const store = createSongSubmissionStore({ observeIntervalMs: 5 });
    store.adopt(handover({ refresh, retry }));
    await vi.waitFor(() => expect(viewOf(store)?.status).toBe("processing_failed"));
    // It keeps reading, but never reruns processing on its own.
    await new Promise(resolve => setTimeout(resolve, 120));
    expect(retry).not.toHaveBeenCalled();
    expect(viewOf(store)?.status).toBe("processing_failed");
    store.retry("song-1");
    await vi.waitFor(() => expect(viewOf(store)?.status).toBe("published"));
    expect(retry).toHaveBeenCalledOnce();
    store.dispose();
  });

  it("reads the song again when a rerun goes unanswered instead of leaving it marked failed", async () => {
    // The server took the rerun; only its answer was lost.
    const refresh = vi.fn().mockResolvedValueOnce(failed(true)).mockResolvedValue(processing("analysis"));
    const retry = vi.fn(async () => { throw new Error("no answer"); });
    const store = createSongSubmissionStore({ observeIntervalMs: 5 });
    store.adopt(handover({ refresh, retry }));
    await vi.waitFor(() => expect(viewOf(store)?.status).toBe("processing_failed"));
    store.retry("song-1");
    await vi.waitFor(() => expect(viewOf(store)?.status).toBe("processing"));
    expect(retry).toHaveBeenCalledOnce();
    store.dispose();
  });

  it("keeps an original-song failure recoverable and resumes after the server accepts it", async () => {
    const required = snapshot({ status: "action_required", submission_id: "song-1", action: { expires_at: "2099-01-01T00:00:00Z", reference_request_ref: "reference-1" } });
    const refresh = vi.fn(async () => required);
    const bindOriginal = vi.fn().mockRejectedValueOnce(new Error("ineligible source")).mockResolvedValue(processing("decision"));
    const store = createSongSubmissionStore({ observeIntervalMs: 100, requestTimeoutMs: 50 });
    store.adopt(handover({ refresh, retry: vi.fn(), bindOriginal }));
    store.check("song-1");
    await vi.waitFor(() => expect(viewOf(store)?.status).toBe("action_required"));
    store.bindOriginal("song-1", "/posts/source");
    await vi.waitFor(() => expect(store.items()[0]?.originalError).toContain("couldn't confirm"));
    expect(viewOf(store)?.status).toBe("action_required");
    store.bindOriginal("song-1", "/posts/eligible-source");
    await vi.waitFor(() => expect(viewOf(store)?.status).toBe("processing"));
    expect(bindOriginal).toHaveBeenCalledTimes(2);
    expect(store.items()[0]?.originalError).toBeNull();
    store.dispose();
  });

  it("accepts recovery actions during failed-read backoff and retains an uncertain original", async () => {
    let pending = false;
    const refresh = vi.fn().mockRejectedValue(new Error("offline"));
    const bindOriginal = vi.fn(async () => { pending = true; throw new Error("lost answer"); });
    const retryOriginal = vi.fn(async () => { pending = false; return processing("decision"); });
    const store = createSongSubmissionStore({ observeIntervalMs: 100, requestTimeoutMs: 50 });
    store.adopt({ ...handover({ refresh, retry: vi.fn(), bindOriginal, retryOriginal, hasPendingOriginal: () => pending }), view: { status: "action_required", submissionId: "song-1", expiresAt: "2099-01-01T00:00:00Z", referenceRequestRef: "reference-1" } });
    store.check("song-1");
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    store.bindOriginal("song-1", "/posts/source-a");
    await vi.waitFor(() => expect(store.items()[0]?.originalUnconfirmed).toBe(true));
    store.bindOriginal("song-1", "/posts/source-b");
    expect(bindOriginal).toHaveBeenCalledOnce();
    store.retryOriginal("song-1");
    await vi.waitFor(() => expect(viewOf(store)?.status).toBe("processing"));
    expect(retryOriginal).toHaveBeenCalledOnce();
    expect(store.items()[0]?.originalUnconfirmed).toBe(false);
    store.dispose();
  });

  it("accepts a processing rerun during failed-read backoff", async () => {
    const retry = vi.fn(async () => processing("analysis"));
    const refresh = vi.fn(async () => { throw new Error("offline"); });
    const store = createSongSubmissionStore({ observeIntervalMs: 100 });
    store.adopt({ ...handover({ refresh, retry }), view: { status: "processing_failed", submissionId: "song-1", reasonCode: "analysis_failed", retryable: true } });
    store.check("song-1");
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    store.retry("song-1");
    await vi.waitFor(() => expect(viewOf(store)?.status).toBe("processing"));
    expect(retry).toHaveBeenCalledOnce();
    store.dispose();
  });

  it("keeps reading, slowly, while a song waits on its author", async () => {
    const refresh = vi.fn().mockResolvedValueOnce(failed(false)).mockResolvedValue(snapshot({ status: "abandoned", submission_id: "song-1", reason_code: "expired" }));
    const store = createSongSubmissionStore({ observeIntervalMs: 3 });
    store.adopt(handover({ refresh, retry: vi.fn() }));
    await vi.waitFor(() => expect(viewOf(store)?.status).toBe("abandoned"));
    store.dispose();
  });

  it("offers no rerun for a failure the server says is final", async () => {
    const retry = vi.fn();
    const store = createSongSubmissionStore({ observeIntervalMs: 5 });
    store.adopt(handover({ refresh: vi.fn(async () => failed(false)), retry }));
    await vi.waitFor(() => expect(viewOf(store)?.status).toBe("processing_failed"));
    store.retry("song-1");
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(retry).not.toHaveBeenCalled();
    store.dispose();
  });

  it("holds reads while the session is gone and forgets the song on sign-out or another account", async () => {
    const refresh = vi.fn(async () => processing("analysis"));
    const store = createSongSubmissionStore({ observeIntervalMs: 5 });
    store.pause();
    store.adopt(handover({ refresh, retry: vi.fn() }));
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(refresh).not.toHaveBeenCalled();
    store.resume("account-one");
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());

    store.pause();
    const reads = refresh.mock.calls.length;
    store.retainAccount("account-two");
    store.resume("account-two");
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(store.items()).toHaveLength(0);
    expect(refresh.mock.calls.length).toBeLessThanOrEqual(reads + 1);

    store.adopt(handover({ refresh, retry: vi.fn() }, "account-two"));
    store.clear();
    await vi.waitFor(() => expect(store.items()).toHaveLength(0));
    store.dispose();
  });
});
