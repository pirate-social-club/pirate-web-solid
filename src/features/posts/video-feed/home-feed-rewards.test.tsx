import { render } from "@solidjs/web";
import { afterEach, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { createHomeFeedRewards } from "./home-feed-rewards.tsx";
import { multipleActivityRewardsFixture } from "../public-post/song-activities.fixtures.ts";

let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); document.body.replaceChildren(); });
function mount(readRewards = vi.fn(async () => multipleActivityRewardsFixture), communityId: string | undefined = "song-community") {
  const host = document.createElement("div"); document.body.appendChild(host);
  const resolveLink = vi.fn(async () => ({ href: "/song", title: "Song", authorName: "Author", communityId }));
  dispose = render(() => {
    const rewards = createHomeFeedRewards({ songs: () => ["song", "song"], scope: () => "anonymous", songForPost: () => "song", resolveLink, readRewards });
    return <>{rewards.renderLabels("video")}{rewards.dialog()}</>;
  }, host);
  return { host, readRewards, resolveLink };
}
it("reads the song's owning community once and deduplicates rewards shared across activities", async () => {
  const { host, readRewards } = mount();
  await vi.waitFor(() => expect(host.querySelectorAll("[data-reward-kind]")).toHaveLength(2));
  expect(readRewards).toHaveBeenCalledExactlyOnceWith("song-community", "song");
  expect(host.querySelector('[data-reward-kind="lottery"]')?.textContent).toBe("$1M lottery");
  const pill = host.querySelector<HTMLButtonElement>('[data-reward-kind="bonus"]')!;
  await userEvent.click(pill);
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Study"));
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Karaoke");
  await userEvent.keyboard("{Escape}");
  await vi.waitFor(() => expect(document.activeElement).toBe(pill));
});
it("hides a reward that becomes exhausted when its terms are opened", async () => {
  const readRewards = vi.fn(async () => multipleActivityRewardsFixture);
  const { host } = mount(readRewards);
  await vi.waitFor(() => expect(host.querySelector('[data-reward-kind="lottery"]')).not.toBeNull());
  readRewards.mockImplementation(async () => ({ ...multipleActivityRewardsFixture, pool: null }));
  await userEvent.click(host.querySelector<HTMLButtonElement>('[data-reward-kind="lottery"]')!);
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Reward unavailable"));
  expect(host.querySelector('[data-reward-kind="lottery"]')).toBeNull();
});
it("does not invent rewards when the public read fails", async () => {
  const readRewards = vi.fn(async () => { throw new Error("offline"); });
  const { host } = mount(readRewards);
  await vi.waitFor(() => expect(readRewards).toHaveBeenCalledOnce());
  expect(host.querySelector("[data-reward-kind]")).toBeNull();
});
