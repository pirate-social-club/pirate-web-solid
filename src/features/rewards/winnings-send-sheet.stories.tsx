import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { WinningsSendSheet } from "./winnings-send-sheet.tsx";
import { fixtureHash, fixtureRecipient, fixtureRecord, paidWinning, sendFixture, type SendFixtureOptions } from "./winnings-send.fixtures.ts";

const meta = {
  title: "Parts/Wallet/Send winnings",
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const sheet = (options: SendFixtureOptions = {}) => () => (
  <WinningsSendSheet credit={paidWinning} dependencies={sendFixture(options)} onClose={fn()} />
);
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
export const Mobile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } }, render: sheet() };
export const SendHappyPath: Story = {
  render: sheet(),
  play: async () => {
    const page = screen();
    await signIn();
    await expect(await page.findByText(/up to 0.000062 ETH/u)).toBeVisible();
    await userEvent.click(page.getByRole("button", { name: "Send winnings" }));
    await expect(await page.findByText(/network is still checking this send/u)).toBeVisible();
    await expect(page.getByRole("link", { name: /View transfer/u })).toHaveAttribute("href", `https://sepolia.basescan.org/tx/${fixtureHash}`);
  },
};
export const GasUsedUpWithoutEth: Story = {
  render: sheet({ gas: { status: "limit_reached", topup_id: null, amount_wei: null }, noEth: true }),
  play: async () => {
    await signIn();
    await expect(await screen().findByText(/wallet needs more ETH/u)).toBeVisible();
  },
};
export const UncertainSubmission: Story = {
  render: sheet({ uncertain: true }),
  play: async () => {
    const page = screen();
    await signIn();
    await userEvent.click(page.getByRole("button", { name: "Send winnings" }));
    await expect(await page.findByText(/recorded transaction number/u)).toBeVisible();
  },
};
export const PreviousTransferPending: Story = {
  render: sheet({ record: { ...fixtureRecord, status: "pending", transaction_hashes: [fixtureHash] } }),
  play: async () => {
    const page = screen();
    await expect(await page.findByText(/network is still checking this send/u)).toBeVisible();
    await expect(page.queryByLabelText("Send to")).toBeNull();
  },
};
