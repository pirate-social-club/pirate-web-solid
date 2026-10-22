import { expect, test, vi } from "vitest";
import { renderToString } from "@solidjs/web";
import { DanceSongPage } from "./dance-song-page";
import { createDanceCameraFixtureApi } from "./dance-camera.fixtures";
test("the Dance entry server shell opens no session, private read or recording resources", () => {
  const api = createDanceCameraFixtureApi(), options = vi.spyOn(api, "options"), owner = vi.spyOn(api, "owner"), session = vi.fn(), recorder = vi.fn();
  const html = renderToString(() => <DanceSongPage communityId="community" postId="song" api={api} session={session} recorder={recorder} />);
  expect(html).toContain("Loading dances"); expect(html).not.toContain("Camera preview"); expect(session).not.toHaveBeenCalled(); expect(options).not.toHaveBeenCalled(); expect(owner).not.toHaveBeenCalled(); expect(recorder).not.toHaveBeenCalled();
});
