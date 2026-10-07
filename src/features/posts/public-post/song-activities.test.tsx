import { render } from "@solidjs/web";
import { createRoot } from "solid-js";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { SongActivities, type SongActivitiesDependencies, type SongActivityViewer } from "./song-activities.tsx";
import { activityRewardsFixture, multipleActivityRewardsFixture, noActivityRewardsFixture } from "./song-activities.fixtures.ts";

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
  expect(document.body.textContent).toContain("Lottery");
  const details = document.querySelector<HTMLElement>('[aria-label="Karaoke reward details"]')!;
  expect(details.hidden).toBe(true);
  await userEvent.click(button("Karaoke rewards: Lottery"));
  expect(details.hidden).toBe(false);
  expect(document.body.textContent).toContain("Qualify for a chance to share the winnings.");
  expect(choose).not.toHaveBeenCalled();
  await userEvent.click(button("Karaoke rewards: Lottery"));
  expect(details.hidden).toBe(true);
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

it("summarizes multiple rewards without combining payouts or starting the activity", async () => {
  const bonus = multipleActivityRewardsFixture.bonuses.items[0];
  const { choose } = mount("anonymous", {
    readVideoEligibility: async () => false,
    readRewards: async () => ({ ...multipleActivityRewardsFixture, bonuses: { ...multipleActivityRewardsFixture.bonuses,
      items: [bonus, { ...bonus, leg_id: "another-bonus", token_symbol: "TESTTOKEN", token_address: "0x0000000000000000000000000000000000000002", amount_per_claim_atomic: "1000000", qualification_policies: bonus.qualification_policies?.filter(policy => policy.activity === "karaoke") ?? [] }] } }),
  });
  await userEvent.click(button("Activities"));
  await vi.waitFor(() => expect(button("Karaoke rewards: 1 TESTTOKEN")).not.toBeNull());
  await userEvent.click(button("Karaoke rewards: 1 TESTTOKEN"));
  const details = document.querySelector<HTMLElement>('[aria-label="Karaoke reward details"]')!;
  expect(details.hidden).toBe(false);
  expect(details.textContent).toContain("2.5 USDC bonus");
  expect(details.textContent).toContain("1 TESTTOKEN bonus");
  expect(details.textContent).toContain("$1M lottery");
  expect(details.textContent).not.toContain("3.5 USDC");
  expect(choose).not.toHaveBeenCalled();
});
