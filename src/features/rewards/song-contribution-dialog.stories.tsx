import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { Show, createSignal } from "solid-js";
import { Button } from "../../design-system.ts";
import { contributionFixtures as f } from "../../api/song-contributions.fixture.ts";
import { SongContributionDialog } from "./song-contribution-dialog.tsx";
import { createContributionDialogFixture, createSongContributionFixture } from "./song-contribution.fixtures.ts";

const meta = {
  title: "Flows/Rewards/Shared song contribution",
  parameters: { layout: "centered", docs: { description: { component: "Actual contribution UI and controller with fictional API projections and a simulated testnet wallet. Use2 USDC and any email/code. No funds move. Closing and reopening retains the original journal." } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Fixture(props: { readonly unknown?: boolean; readonly paused?: boolean }) {
  const fixture = createSongContributionFixture(), dependencies = createContributionDialogFixture(fixture);
  if (props.unknown) fixture.setWallet("unknown");
  if (props.paused) fixture.api.context = async () => ({ object: "song_megapot_funding_context", version: 2, readiness: "unavailable", target: f.context.target, persona_id: f.scope.personaId, reason: "paused", retry_after_seconds: 30, own_recovery_href: null });
  const [open, setOpen] = createSignal(true);
  return <><Button onClick={() => setOpen(true)}>Open contribution</Button><Show when={open()}><SongContributionDialog communityId={f.scope.communityId} postId={f.scope.postId} songTitle="Fixture song" onClose={() => setOpen(false)} dependencies={dependencies} /></Show></>;
}
export const Amount: Story = { render: () => <Fixture /> };
export const Paused: Story = { render: () => <Fixture paused /> };

const reviewPayment = async (body: HTMLElement) => {
  const page = within(body);
  await userEvent.type(await page.findByLabelText("Contribution (USDC)"), "2");
  await userEvent.click(page.getByRole("button", { name: "Review contribution" }));
  await userEvent.click(await page.findByRole("button", { name: "Continue to payment" }));
  await userEvent.click(await page.findByRole("button", { name: "Review payment" }));
  await userEvent.type(await page.findByLabelText("Email for your wallet"), "operator@example.test");
  await userEvent.click(page.getByRole("button", { name: "Send code" }));
  await userEvent.type(await page.findByLabelText("Code"), "123456");
  await userEvent.click(page.getByRole("button", { name: "Review transfer" }));
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
    await userEvent.click(page.getByRole("button", { name: "Pay 2 USDC" }));
    await expect(await page.findByRole("button", { name: "Check original request" })).toBeVisible();
  },
};
