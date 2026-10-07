import { render } from "@solidjs/web";
import { createRoot } from "solid-js";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { SongActivities, type SongActivitiesDependencies, type SongActivityViewer } from "./song-activities.tsx";
import { activityRewardsFixture, noActivityRewardsFixture } from "./song-activities.fixtures.ts";

const disposers: (() => void)[] = [];
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); document.body.replaceChildren(); vi.unstubAllGlobals(); });
function mount(viewer: SongActivityViewer, dependencies: SongActivitiesDependencies, choose = vi.fn()) {
  const host = document.createElement("div"); document.body.appendChild(host);
  createRoot(dispose => { disposers.push(dispose); render(() => <SongActivities communityId="community" postId="song" studyPath="/song/study" karaokePath="/song/karaoke" viewer={viewer} dependencies={dependencies} onChoose={choose} />, host); });
  return { host, choose };
}
const button = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label='${label}']`)!;

it("lets guests inspect rewards without choosing or reading video policy until the panel opens", async () => {
  const readVideoEligibility = vi.fn(async () => true);
  const { choose } = mount("anonymous", { readRewards: async () => activityRewardsFixture, readVideoEligibility });
  await vi.waitFor(() => expect(button("Activities · rewards available")).not.toBeNull());
  expect(readVideoEligibility).not.toHaveBeenCalled();
  expect(choose).not.toHaveBeenCalled();
  await userEvent.click(button("Activities · rewards available"));
  await vi.waitFor(() => expect(button("Dance")).not.toBeNull());
  expect(document.body.textContent).toContain("2.5 USDC bonus");
  expect(document.body.textContent).toContain("Megapot · chance to win");
  expect(readVideoEligibility).toHaveBeenCalledExactlyOnceWith({ communityId: "community", postId: "song" });
  await userEvent.click(button("Karaoke"));
  expect(choose).toHaveBeenCalledExactlyOnceWith("/song/karaoke", false);
});
it("keeps activities usable when reward reads fail and rechecks on retry", async () => {
  const readRewards = vi.fn<NonNullable<SongActivitiesDependencies["readRewards"]>>(async () => { throw new Error("offline"); });
  const { choose } = mount("anonymous", { readRewards, readVideoEligibility: async () => false });
  await userEvent.click(button("Activities"));
  await vi.waitFor(() => expect(document.body.textContent).toContain("Rewards could not be checked"));
  expect(button("Study").disabled).toBe(false);
  readRewards.mockImplementation(async () => noActivityRewardsFixture);
  await userEvent.click([...document.querySelectorAll("button")].find(node => node.textContent === "Retry rewards")!);
  await vi.waitFor(() => expect(document.body.textContent).not.toContain("Rewards could not be checked"));
  await userEvent.click(button("Study"));
  expect(choose).toHaveBeenCalledWith("/song/study", false);
});
it.each(["pending", "error"] as const)("does not treat %s session state as signed out", async viewer => {
  const { choose } = mount(viewer, { readRewards: async () => noActivityRewardsFixture, readVideoEligibility: async () => false });
  await userEvent.click(button("Activities"));
  expect(button("Study").disabled).toBe(true);
  expect(button("Karaoke").disabled).toBe(true);
  expect(choose).not.toHaveBeenCalled();
});
it("routes Dance through the existing song-linked video flow", async () => {
  const { choose } = mount({ status: "authenticated", userId: "account", personas: [] }, { readRewards: async () => noActivityRewardsFixture, readVideoEligibility: async () => true });
  await userEvent.click(button("Activities"));
  await vi.waitFor(() => expect(button("Dance")).not.toBeNull());
  await userEvent.click(button("Dance"));
  expect(choose).toHaveBeenCalledExactlyOnceWith("/communities?compose=video&song=song", true);
});
it("returns keyboard focus to the activity pill when the chooser is dismissed", async () => {
  mount("anonymous", { readRewards: async () => noActivityRewardsFixture, readVideoEligibility: async () => false });
  const trigger = button("Activities");
  await userEvent.click(trigger);
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
  await userEvent.keyboard("{Escape}");
  await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
});

it("adapts the label to the action row when desktop comments narrow the card", async () => {
  let width = 704;
  let resize: () => void = () => undefined;
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe(row: HTMLElement) { Object.defineProperty(row, "clientWidth", { get: () => width }); resize(); }
    disconnect = disconnect;
  });
  mount("anonymous", { readRewards: async () => noActivityRewardsFixture, readVideoEligibility: async () => false });
  await vi.waitFor(() => expect(button("Activities").textContent).toBe("Activities"));
  width = 288; resize();
  await vi.waitFor(() => expect(button("Activities").textContent).toBe(""));
  width = 358; resize();
  await vi.waitFor(() => expect(button("Activities").textContent).toBe("Activities"));
  disposers.splice(0).forEach(dispose => dispose());
  expect(disconnect).toHaveBeenCalledOnce();
});
