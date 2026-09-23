/** @jsxImportSource @solidjs/web */
import { ApiClientError } from "@pirate/api-client";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import { deleteAllRecordings, PartialRecordingDeletion, RecordingsSettings, recordingDeletionError, recordingDeletionMessage } from "./recordings-settings";

const disposers: Array<() => void> = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
});

function apiError(status: 401 | 409 | 502): ApiClientError {
  const code = status === 401 ? "auth_error" : status === 409 ? "conflict" : "provider_unavailable";
  return new ApiClientError(
    { code, name: "Declared", retryable: status !== 401, status },
    { error: { code, message: "Redacted", retryable: status !== 401 } },
  );
}

function button(label: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(candidate => candidate.textContent?.trim() === label);
  expect(found).toBeInstanceOf(HTMLButtonElement);
  return found!;
}

describe("recordings settings", () => {
  test("reports the counts honestly", () => {
    expect(recordingDeletionMessage({ deleted: 0, remaining: 0 })).toBe("You have no stored recordings.");
    expect(recordingDeletionMessage({ deleted: 1, remaining: 0 })).toBe("Deleted 1 recording.");
    expect(recordingDeletionMessage({ deleted: 3, remaining: 2 })).toBe("Deleted 3 recordings. 2 recordings still stored. Delete again to remove them.");
  });

  test("names each declared failure by its real cause", () => {
    expect(recordingDeletionError(apiError(401))).toBe("Sign in again to delete your recordings.");
    expect(recordingDeletionError(apiError(409))).toBe("A Study or Karaoke recording is still in progress. Finish or leave it, then try again.");
    expect(recordingDeletionError(apiError(502))).toBe("Recording storage is unavailable right now. Try again later.");
    expect(recordingDeletionError(new Error("network"))).toBe("Your recordings could not be deleted. Try again.");
  });

  test("repeats the bounded deletion until nothing remains", async () => {
    const batches = [
      { deleted_count: 1000, remaining_count: 1500 },
      { deleted_count: 1000, remaining_count: 500 },
      { deleted_count: 500, remaining_count: 0 },
    ];
    const deleteBatch = vi.fn(async () => ({ object: "learner_audio_deletion" as const, last_deleted_at: null, ...batches.shift()! }));
    expect(await deleteAllRecordings(deleteBatch)).toEqual({ deleted: 2500, remaining: 0 });
    expect(deleteBatch).toHaveBeenCalledTimes(3);
  });

  test("stops at the round limit and reports what remains", async () => {
    const deleteBatch = vi.fn(async () => ({ object: "learner_audio_deletion" as const, last_deleted_at: null, deleted_count: 1000, remaining_count: 9000 }));
    expect(await deleteAllRecordings(deleteBatch, 2)).toEqual({ deleted: 2000, remaining: 9000 });
    expect(deleteBatch).toHaveBeenCalledTimes(2);
  });

  test("keeps the deleted count when a later batch fails", async () => {
    let call = 0;
    const deleteBatch = async () => {
      call += 1;
      if (call === 2) throw apiError(409);
      return { object: "learner_audio_deletion" as const, last_deleted_at: null, deleted_count: 1000, remaining_count: 400 };
    };
    await expect(deleteAllRecordings(deleteBatch)).rejects.toBeInstanceOf(PartialRecordingDeletion);
    const error = await deleteAllRecordings(async () => { throw apiError(502); }).catch(caught => caught);
    expect(error).not.toBeInstanceOf(PartialRecordingDeletion);
    call = 0;
    const partial = await deleteAllRecordings(deleteBatch).catch(caught => caught);
    expect(recordingDeletionError(partial)).toBe("Deleted 1000 recordings, then stopped. A Study or Karaoke recording is still in progress. Finish or leave it, then try again.");
  });

  test("deletes only after confirmation and shows the result", async () => {
    const deleteRecordings = vi.fn(async () => ({ object: "learner_audio_deletion" as const, deleted_count: 4, remaining_count: 0, last_deleted_at: null }));
    const container = document.createElement("div");
    document.body.appendChild(container);
    createRoot(dispose => { disposers.push(dispose); solidRender(() => <RecordingsSettings deleteRecordings={deleteRecordings} />, container); });
    button("Delete my recordings").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Delete your recordings?"));
    button("Keep them").click();
    expect(deleteRecordings).not.toHaveBeenCalled();
    button("Delete my recordings").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Delete your recordings?"));
    button("Delete recordings").click();
    await vi.waitFor(() => expect(container.textContent).toContain("Deleted 4 recordings."));
    expect(deleteRecordings).toHaveBeenCalledOnce();
  });

  test("shows a conflict as an alert", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    createRoot(dispose => { disposers.push(dispose); solidRender(() => <RecordingsSettings deleteRecordings={async () => { throw apiError(409); }} />, container); });
    button("Delete my recordings").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Delete your recordings?"));
    button("Delete recordings").click();
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toBe("A Study or Karaoke recording is still in progress. Finish or leave it, then try again."));
  });
});
