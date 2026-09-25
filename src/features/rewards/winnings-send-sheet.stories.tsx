import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { WinningsSendSheet } from "./winnings-send-sheet.tsx";
import { fixtureHash, fixtureRecipient, fixtureSender, paidWinning, sendFixture, type SendFixtureOptions } from "./winnings-send.fixtures.ts";

const meta = {
  title: "Parts/Wallet/Send winnings",
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const sheet = (options: SendFixtureOptions = {}) => () => (
  <WinningsSendSheet credit={paidWinning} dependencies={sendFixture(options)} onClose={fn()} />
);

/** The modal renders in a portal, so queries run against the whole document. */
const screen = () => within(document.body);

async function signIn() {
  const page = screen();
  await expect(await page.findByText("Wallet balance: 12.5 USDC")).toBeVisible();
  await userEvent.type(page.getByLabelText("Send to"), fixtureRecipient);
  await userEvent.click(page.getByRole("button", { name: "Continue" }));
  await userEvent.type(await page.findByLabelText("Email for your wallet"), "winner@example.test");
  await userEvent.click(page.getByRole("button", { name: "Send code" }));
  await userEvent.type(await page.findByLabelText("Code"), "123456");
  await userEvent.click(page.getByRole("button", { name: "Continue" }));
}

export const States: Story = { render: sheet() };

export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: sheet(),
};

export const SendHappyPath: Story = {
  render: sheet(),
  play: async () => {
    const page = screen();
    await signIn();
    await expect(await page.findByText("Getting the network fee ready…")).toBeVisible();
    await userEvent.click(await page.findByRole("button", { name: "Send 12.5 USDC" }, { timeout: 5000 }));
    await expect(await page.findByText("Sent")).toBeVisible();
    const link = page.getByRole("link", { name: /View transaction/u });
    await expect(link).toHaveAttribute("href", `https://sepolia.basescan.org/tx/${fixtureHash}`);
  },
};

export const GasUsedUpWithoutEth: Story = {
  render: sheet({ gas: { status: "limit_reached", topup_id: null, amount_wei: null }, noEth: true }),
  play: async () => {
    const page = screen();
    await signIn();
    await expect(await page.findByText(/Gas help is used up for today, and your wallet does not have enough ETH/u)).toBeVisible();
    await waitFor(() => expect(page.queryByRole("button", { name: /^Send 12/u })).toBeNull());
  },
};

export const UncertainSubmission: Story = {
  render: sheet({ uncertain: true }),
  play: async () => {
    const page = screen();
    await signIn();
    await userEvent.click(await page.findByRole("button", { name: "Send 12.5 USDC" }, { timeout: 5000 }));
    await expect(await page.findByText(/It may still arrive/u)).toBeVisible();
    await expect(page.queryByRole("button", { name: "Try again" })).toBeNull();
  },
};

export const PreviousTransferPending: Story = {
  render: sheet({
    receipt: "pending",
    previous: {
      version: 1, creditId: paidWinning.credit_id, sender: fixtureSender, recipient: fixtureRecipient,
      amountAtomic: paidWinning.paid_atomic, transactionHash: fixtureHash, startedAt: Date.now(),
    },
  }),
  play: async () => {
    const page = screen();
    await expect(await page.findByText(/still on its way/u)).toBeVisible();
    await expect(page.queryByLabelText("Send to")).toBeNull();
  },
};
