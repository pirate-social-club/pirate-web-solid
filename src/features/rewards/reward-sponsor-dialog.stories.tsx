import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Show, createSignal, createEffect } from "solid-js";
import { ContentOverflowMenu } from "../posts/shared-engagement/content-overflow-menu.tsx";
import { RewardSponsorDialog } from "./reward-sponsor-dialog.tsx";
import { rewardSponsorFixture, rewardSponsorScenarioFixture, rewardSponsorExpiredFixture, type RewardSponsorWalletCalls } from "./reward-sponsor.fixtures.ts";
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

/*
 * Paper Parts/Payments/PayStep, as the Boost dialog carries it today: the
 * wallet unlock (email, then a code) and the transfer review. The stories
 * stop at review. Each mounts a fresh fixture whose wallet counts what it
 * was asked to do, and the play checks nothing was signed or broadcast.
 */
const phone = { globals: { viewport: { value: "mobile1", isRotated: false } } } as const;

function payStepStory(stage: "unlock" | "review") {
  let calls: RewardSponsorWalletCalls = { estimate: 0, send: 0, observe: 0 };
  return {
    render: () => {
      calls = { estimate: 0, send: 0, observe: 0 };
      return <RewardSponsorDialog communityId="community" postId="song" songTitle="Salt & Static"
        dependencies={rewardSponsorFixture({ calls })} onClose={() => {}} />;
    },
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
      const doc = canvasElement.ownerDocument;
      const dialog = await within(doc.body).findByRole("dialog", {}, { timeout: 5000 });
      const sheet = within(dialog);
      const settle = () => new Promise(resolve => setTimeout(resolve, 0));
      // Compose a Megapot reward and accept its terms.
      await userEvent.type(await sheet.findByLabelText("Total budget (USDC)"), "10");
      await settle();
      await userEvent.type(sheet.getByLabelText("Maximum ticket price (USDC)"), "1");
      await settle();
      const ends = dialog.querySelector<HTMLInputElement>('input[type="datetime-local"]');
      if (ends === null) throw new Error("Expected the offer end field");
      ends.value = "2099-09-15T12:00";
      ends.dispatchEvent(new Event("input", { bubbles: true }));
      await settle();
      await userEvent.click(sheet.getByRole("button", { name: "Review terms" }));
      await userEvent.click(await sheet.findByRole("button", { name: "Create reward" }));

      // Unlock: the wallet asks for its email, then a code.
      await expect(await sheet.findByText(/Confirm access to Harbor persona's wallet/u)).toBeVisible();
      await expect(sheet.getByText(/You will review the transfer before sending/u)).toBeVisible();
      const send = sheet.getByRole("button", { name: "Send code" });
      await expect(send).toBeDisabled();
      // Controlled fields: enter each value as one input, as autofill or paste would.
      const email = sheet.getByLabelText("Email for your wallet");
      await userEvent.click(email);
      await userEvent.paste("harbor@example.com");
      await waitFor(() => expect(email).toHaveValue("harbor@example.com"));
      await settle();
      await waitFor(() => expect(send).toBeEnabled());
      await userEvent.click(send);
      const code = await sheet.findByLabelText("Code");
      await expect(sheet.getByRole("button", { name: "Review transfer" })).toBeDisabled();

      if (stage === "review") {
        await userEvent.click(code);
        await userEvent.paste("123456");
        await waitFor(() => expect(code).toHaveValue("123456"));
        await settle();
        await userEvent.click(sheet.getByRole("button", { name: "Review transfer" }));
        // Review: the transfer is shown in full and waits for Confirm.
        // The unlock step's button shares the heading's words: wait for the panel itself.
        const confirm = await sheet.findByRole("button", { name: "Confirm transfer" });
        await expect(sheet.getByText("Review transfer", { selector: "p" })).toBeVisible();
        await expect(sheet.getByText("Harbor persona")).toBeVisible();
        await expect(sheet.getByText(`0x${"b".repeat(40)}`)).toBeVisible();
        await expect(sheet.getByText("Base Sepolia · testnet")).toBeVisible();
        await expect(sheet.getByText("10 USDC")).toBeVisible();
        await expect(sheet.getByText("0.000042 ETH")).toBeVisible();
        await expect(confirm).toBeEnabled();
        await expect(calls.estimate).toBeGreaterThan(0);
      }

      // Nothing was signed, broadcast or observed.
      await expect(calls.send).toBe(0);
      await expect(calls.observe).toBe(0);
      await expect(sheet.queryByText(/Transaction:/u)).toBeNull();

      if (doc.defaultView!.innerWidth < 768) {
        // On a phone the step is a bottom sheet.
        const view = doc.defaultView!;
        await waitFor(() => expect(Math.abs(dialog.getBoundingClientRect().bottom - view.innerHeight)).toBeLessThanOrEqual(1), { timeout: 3000 });
      } else {
        await expect(Math.round(dialog.getBoundingClientRect().width)).toBe(440);
      }
    },
  };
}

/** PayStep Confirm: unlock the wallet with an emailed code before any transfer. */
export const PayStepWalletUnlock: Story = { ...payStepStory("unlock") };
export const PayStepWalletUnlockMobile: Story = { ...phone, ...payStepStory("unlock") };
/** PayStep Review: the transfer to confirm. Stops here; nothing is signed or sent. */
export const PayStepTransferReview: Story = { ...payStepStory("review") };
export const PayStepTransferReviewMobile: Story = { ...phone, ...payStepStory("review") };
