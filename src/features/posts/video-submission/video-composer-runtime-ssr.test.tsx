import { renderToString } from "@solidjs/web";
import { expect, test, vi } from "vitest";
import type { VideoStorage } from "./coordinator";
import { VideoComposerRuntime } from "./video-composer-runtime";

test("server rendering creates no actor work or account-scoped storage read", async () => {
  const load = vi.fn(async () => null);
  const storage: VideoStorage = {
    exclusive: async work => work(), load, save: async () => {}, remove: async () => {},
  };
  const render = (principalId: string, admitted = false) => renderToString(() => <VideoComposerRuntime
    principalId={principalId} communityId="community" personaId={admitted ? "persona" : undefined} storage={storage}
    onExit={() => {}} onRetainedPersona={() => {}} />);

  expect(globalThis).not.toHaveProperty("document");
  const first = render("account-one");
  const second = render("account-two");
  await Promise.resolve();
  expect(load).not.toHaveBeenCalled();
  expect(first).toBe(second);
  expect(first).toContain('aria-label="Preparing video"');
  const admittedFirst = render("account-one", true);
  const admittedSecond = render("account-two", true);
  expect(admittedFirst).toBe(admittedSecond);
  expect(admittedFirst).toContain('aria-label="Preparing video"');
});
