import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Show, createSignal } from "solid-js";
import { Button } from "../../design-system.ts";
import { SongContributionDialog } from "./song-contribution-dialog.tsx";
import { contributionDialogFixtureTarget, createContributionDialogFixture, createSongContributionFixture } from "./song-contribution.fixtures.ts";

const meta = {
  title: "Flows/Rewards/Shared song contribution",
  parameters: { layout: "centered", docs: { description: { component: "Actual contribution UI and controller with fictional API projections and a simulated testnet wallet. Use2 USDC and any email/code. No funds move. Closing and reopening retains the original journal." } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Fixture(props: { readonly unknown?: boolean; readonly paused?: boolean }) {
  const fixture = createSongContributionFixture(), dependencies = createContributionDialogFixture(fixture);
  if (props.unknown) fixture.setWallet("unknown");
  if (props.paused) fixture.setPaused();
  const [open, setOpen] = createSignal(true);
  return <><Button onClick={() => setOpen(true)}>Open contribution</Button><Show when={open()}><SongContributionDialog {...contributionDialogFixtureTarget} onClose={() => setOpen(false)} dependencies={dependencies} /></Show></>;
}
export const Amount: Story = { render: () => <Fixture /> };
export const Paused: Story = { render: () => <Fixture paused /> };

const clickReady = async (page: ReturnType<typeof within>, name: string) => {
  const button = await waitFor(() => {
    const candidate = page.getByRole("button", { name, exact: true });
    if (candidate.matches(":disabled")) throw new Error(`Waiting for ${name} to be enabled`);
    return candidate;
  });
  await expect(button).toBeEnabled();
  await userEvent.click(button);
};
const reviewPayment = async (body: HTMLElement) => {
  const page = within(body);
  await userEvent.type(await page.findByLabelText("Contribution (USDC)"), "2");
  await clickReady(page, "Review contribution");
  await clickReady(page, "Continue to payment");
  await clickReady(page, "Review payment");
  await userEvent.type(await page.findByLabelText("Email for your wallet"), "operator@example.test");
  await clickReady(page, "Send code");
  await userEvent.type(await page.findByLabelText("Code"), "123456");
  await clickReady(page, "Review transfer");
  await expect(await page.findByRole("button", { name: "Pay 2 USDC" })).toBeVisible();
};
export const ReviewPay: Story = {
  render: () => <Fixture />,
  play: async ({ canvasElement }) => reviewPayment(canvasElement.ownerDocument.body),
};
export const UnknownWalletOutcome: Story = {
  render: () => <Fixture unknown />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body); await reviewPayment(canvasElement.ownerDocument.body);
    await clickReady(page, "Pay 2 USDC");
    await expect(await page.findByRole("button", { name: "Check original request" })).toBeVisible();
  },
};
