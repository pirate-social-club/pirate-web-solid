import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Show, createSignal, createEffect } from "solid-js";
import { ContentOverflowMenu } from "../posts/shared-engagement/content-overflow-menu.tsx";
import { RewardSponsorDialog } from "./reward-sponsor-dialog.tsx";
import { rewardSponsorFixture, rewardSponsorScenarioFixture, rewardSponsorExpiredFixture } from "./reward-sponsor.fixtures.ts";
const meta = {
  title: "Flows/Rewards/Functional boost",
  parameters: { layout: "centered", docs: { description: { component: "Open Post options and choose Boost. This uses controlled API and wallet fixtures with the real creation journal and funding controller. Any email and code 123456 work. No funds move. Close and reopen to resume the saved reward." } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const SongMenuToFunding: Story = {
  parameters: { docs: { description: { story: "The shared Post options menu opens the real dialog. Closing it returns focus to the menu button." } } },
  render: () => {
    const dependencies = rewardSponsorFixture();
    const [open,setOpen] = createSignal(false);
    let card: HTMLElement | undefined;
    // As the community post card does: the menu item is gone once the menu
    // closes, so closing the dialog returns focus to the menu trigger.
    const close = () => {
      setOpen(false);
      setTimeout(() => card?.querySelector<HTMLElement>('[aria-label="Post options"]')?.focus(), 0);
    };
    return <article ref={element => { card = element; }} class="w-80 rounded-xl border p-5"><div class="flex justify-between"><h2>Salt &amp; Static</h2>
      <ContentOverflowMenu inline label="Post options" actions={[{ label: "Boost", run: () => setOpen(true) }]} />
    </div><p>Study or sing to qualify for song rewards.</p>
      <Show when={open()}><RewardSponsorDialog communityId="community" postId="song" songTitle="Salt & Static" dependencies={dependencies} onClose={close} /></Show>
    </article>;
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = within(canvasElement).getByRole("button", { name: "Post options" });
    await userEvent.click(trigger);
    await userEvent.click(await page.findByRole("menuitem", { name: "Boost" }));
    const dialog = await page.findByRole("dialog");
    await expect(within(dialog).getByRole("heading", { name: "Create a bounty" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

export const PaperWidth: Story = {
  parameters: { docs: { description: { story: "Browser check: the dialog is Paper's 440 px wide on desktop." } } },
  render: () => <RewardSponsorDialog communityId="community" postId="song" songTitle="Salt & Static"
    dependencies={rewardSponsorFixture()} onClose={() => {}} />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    await expect(within(dialog).getByRole("heading", { name: "Create a bounty" })).toBeVisible();
    if (window.innerWidth >= 768) await expect(Math.round(dialog.getBoundingClientRect().width)).toBe(440);
  },
};

export const OfferSelectionJoinsNewerAssetOffer: Story = {
  parameters: { docs: { description: { story: "Browser proof: the dialog joins the post's addable asset-only offer instead of a terminal pool offer. The fixture refuses any open call, so a regression fails the flow." } } },
  render: () => <RewardSponsorDialog communityId="community" postId="song" songTitle="Salt & Static"
    dependencies={rewardSponsorScenarioFixture("offer_selection")} onClose={() => {}} />,
};

export const ConflictRecoveryAdoptsServerOffer: Story = {
  parameters: { docs: { description: { story: "Browser proof: the first open returns the typed duplicate-offer conflict, rediscovery adopts the server offer, and the leg joins it without a second open or transfer." } } },
  render: () => <RewardSponsorDialog communityId="community" postId="song" songTitle="Salt & Static"
    dependencies={rewardSponsorScenarioFixture("conflict_recovery")} onClose={() => {}} />,
};

function ExpiredAttempt(props: { uncertain: boolean }) {
  const [dependencies, setDependencies] = createSignal<Awaited<ReturnType<typeof rewardSponsorExpiredFixture>>>();
  createEffect(() => true, () => { void rewardSponsorExpiredFixture(props.uncertain).then(setDependencies); });
  return <Show when={dependencies()}>{value => <RewardSponsorDialog communityId="community" postId="song" songTitle="Salt & Static" dependencies={value()} onClose={() => {}} />}</Show>;
}
export const ExpiredUnsubmittedAttempt: Story = { render: () => <ExpiredAttempt uncertain={false} /> };
export const ExpiredUncertainWalletAttempt: Story = { render: () => <ExpiredAttempt uncertain={true} /> };
