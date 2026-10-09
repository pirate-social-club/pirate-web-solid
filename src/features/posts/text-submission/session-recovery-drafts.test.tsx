import { render } from "@solidjs/web";
import { afterEach, expect, it, vi } from "vitest";
import { clearSession, invalidateSession } from "../../../api/session.ts";
import { ApplicationSessionProvider } from "../../shell/application-session.tsx";
import { createSongSubmissionStore, SongSubmissionProvider } from "../song-submission/song-submission-store.tsx";
import { createTextSubmissionStore, TextSubmissionProvider } from "./text-submission-store.tsx";

const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); clearSession(); });

it("retains pending text and song after rejection but clears both on deliberate sign-out", async () => {
  const dispatch = vi.fn(async () => { throw new Error("must stay paused"); });
  const refresh = vi.fn(async () => { throw new Error("must stay paused"); });
  const text = createTextSubmissionStore({ transport: { read: async () => null, dispatch } });
  const song = createSongSubmissionStore();
  text.pause(); song.pause();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = render(() => <ApplicationSessionProvider state={() => "anonymous"}>
    <TextSubmissionProvider store={text}><SongSubmissionProvider store={song}><div /></SongSubmissionProvider></TextSubmissionProvider>
  </ApplicationSessionProvider>, host);
  cleanups.push(() => { dispose(); host.remove(); });
  text.submit({ accountId: "account-1", communityId: "community-1", personaId: "persona-1", title: "", body: "Retain this draft", ageGatePolicy: "none" });
  song.adopt({ accountId: "account-1", communityId: "community-1", submissionId: "song-1", title: "Retain this song", view: { status: "processing", submissionId: "song-1", phase: "analysis" }, source: { refresh, retry: vi.fn() } });
  await vi.waitFor(() => expect(text.items()).toHaveLength(1));
  expect(song.items()).toHaveLength(1);
  invalidateSession();
  await Promise.resolve();
  expect(text.items()).toHaveLength(1);
  expect(song.items()).toHaveLength(1);
  expect(dispatch).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
  clearSession();
  await vi.waitFor(() => expect(text.items()).toHaveLength(0));
  expect(song.items()).toHaveLength(0);
});
