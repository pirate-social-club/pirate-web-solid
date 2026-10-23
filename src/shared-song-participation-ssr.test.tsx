import { renderToString } from "@solidjs/web";
import { expect, test, vi } from "vitest";
import { SharedSongParticipationStatus } from "./features/rewards/shared-song-participation.tsx";

test("server output performs no private history read and contains no account/song/credit projection", () => {
  const read = vi.fn();
  const html = renderToString(() => <SharedSongParticipationStatus communityId="private-community" postId="private-song" data={{ read }} />);
  expect(read).not.toHaveBeenCalled();
  expect(html).not.toMatch(/private-community|private-song|winnings|Claim|USDC/u);
});
