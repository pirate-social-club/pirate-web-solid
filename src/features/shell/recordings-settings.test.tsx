/** @jsxImportSource @solidjs/web */
import { ApiClientError } from "@pirate/api-client";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import { RecordingsSettings, recordingDeletionError, recordingDeletionMessage } from "./recordings-settings";

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
  test("reports the server's counts honestly", () => {
    const base = { object: "learner_audio_deletion" as const, last_deleted_at: null };
    expect(recordingDeletionMessage({ ...base, deleted_count: 0, remaining_count: 0 })).toBe("You have no stored recordings.");
    expect(recordingDeletionMessage({ ...base, deleted_count: 1, remaining_count: 0 })).toBe("Deleted 1 recording.");
    expect(recordingDeletionMessage({ ...base, deleted_count: 3, remaining_count: 2 })).toBe("Deleted 3 recordings. 2 recordings are still being deleted.");
  });

  test("explains each declared failure", () => {
    expect(recordingDeletionError(apiError(401))).toBe("Sign in again to delete your recordings.");
    expect(recordingDeletionError(apiError(409))).toBe("A deletion is already running. Try again in a moment.");
    expect(recordingDeletionError(apiError(502))).toBe("The speech provider couldn't confirm the deletion. Try again.");
    expect(recordingDeletionError(new Error("network"))).toBe("Your recordings could not be deleted. Try again.");
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
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toBe("A deletion is already running. Try again in a moment."));
  });
});
