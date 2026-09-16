import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Show, createSignal } from "solid-js";
import { ActionMenu } from "@pirate/web-solid-ui";
import { RewardSponsorDialog } from "./reward-sponsor-dialog.tsx";
import { rewardSponsorFixture, rewardSponsorScenarioFixture } from "./reward-sponsor.fixtures.ts";
const meta = {
  title: "Flows/Rewards/Functional boost",
  parameters: { layout: "centered", docs: { description: { component: "Open the song menu and choose Boost. This uses controlled API and wallet fixtures with the real creation journal and funding controller. Any email and code 123456 work. No funds move. Close and reopen to resume the saved reward." } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const SongMenuToFunding: Story = {
  render: () => {
    const dependencies = rewardSponsorFixture();
    const [open,setOpen] = createSignal(false);
    return <article class="w-80 rounded-xl border p-5"><div class="flex justify-between"><h2>Salt &amp; Static</h2>
      <ActionMenu label="Song actions" items={[{ key: "boost", label: "Boost" }]} onAction={() => setOpen(true)} />
    </div><p>Study or sing to qualify for song rewards.</p>
      <Show when={open()}><RewardSponsorDialog communityId="community" postId="song" songTitle="Salt & Static" dependencies={dependencies} onClose={() => setOpen(false)} /></Show>
    </article>;
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
