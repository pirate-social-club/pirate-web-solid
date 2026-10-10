import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ConnectedJourney } from "./community-name-connected-fixtures.tsx";
import { label } from "./community-name-test-fixtures.ts";

const meta = { title: "Flows/Connected community join and name", component: ConnectedJourney, parameters: { layout: "fullscreen", a11y: { test: "error" },
  docs: { description: { component: "Production community page and controllers with explicit API fixtures. Reviews join-first timing and the existing Profile return control; no live authentication, deployment or phone acceptance is claimed." } } } } satisfies Meta<typeof ConnectedJourney>;
export default meta;
type Story = StoryObj<typeof meta>;

export const JoinAndName: Story = { play: async ({ canvasElement }) => {
  const body = within(canvasElement.ownerDocument.body);
  await expect(body.queryByRole("dialog")).not.toBeInTheDocument();
  await userEvent.click(await body.findByRole("button", { name: "Join" }));
  const dialog = await body.findByRole("dialog", { name: "Choose your name" });
  await userEvent.type(within(dialog).getByRole("textbox", { name: "Name" }), label);
  await userEvent.click(within(dialog).getByRole("button", { name: "Get name" }));
  await expect(await body.findByRole("link", { name: "Open my name" })).toHaveAttribute("href", `https://${label}.charizard/`);
} };
export const MobileJoinAndName: Story = { ...JoinAndName, globals: { viewport: { value: "mobile1", isRotated: false } } };
export const CloseAndReturnFromProfile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } }, play: async ({ canvasElement }) => {
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(await body.findByRole("button", { name: "Join" }));
  const dialog = await body.findByRole("dialog", { name: "Choose your name" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
  await userEvent.click(await body.findByRole("button", { name: /^(Profile|Profile options), Member$/ }));
  const profile = await body.findByRole("dialog", { name: "Profile in this community" });
  await userEvent.click(within(profile).getByRole("button", { name: "Get name" }));
  await expect(await body.findByRole("dialog", { name: "Choose your name" })).toBeInTheDocument();
  await expect(within(canvasElement).queryByRole("button", { name: "Choose a name" })).not.toBeInTheDocument();
} };
