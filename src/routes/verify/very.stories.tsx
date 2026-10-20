import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";
import { VeryWebClientError, type VeryWebCeremony, type VeryWebPresentation } from "../../api/very.ts";
import VeryVerificationRoute, { type VeryVerificationRouteProps } from "./very.tsx";

const joinUrl = new URL("https://pirate.example/verify/very?community_id=community-harbor&return_to=%2Fc%2Fharbor");
const noop = () => {};

const presentation: VeryWebPresentation = {
  proofSessionId: "proof-session-story",
  expiresAt: "2099-08-20T12:05:00.000Z",
  appId: "very-app-story",
  apiUrl: "https://bridge.very.org/api/v1",
  context: "Palm scan",
  typeId: "3",
  query: "{}",
  verifyUrl: "https://verify.very.org/api/v1/verify",
  mobileUri: "veros://verify?sessionId=story&key=YWJj&action=verify",
  pollUrl: "/verification/sessions/proof-session-story/complete",
};

/** A scan that stays open: the story never reaches the provider. */
const openCeremony = async (): Promise<VeryWebCeremony> => ({
  proofSessionId: presentation.proofSessionId,
  presentation,
  initialCompletion: undefined,
  completeWithWidget: () => new Promise(() => {}),
  pollBridge: () => new Promise(() => {}),
  cancel: noop,
});

/**
 * Stands in for the Very widget. It keeps an overlay in the page, because
 * the route reads the overlay's removal as the person closing the widget.
 */
const storyWidget: VeryVerificationRouteProps["loadWidget"] = async () => ({
  createVeryWidget: () => {
    let overlay: HTMLElement | undefined;
    return {
      open: () => {
        overlay = document.createElement("div");
        overlay.className = "very-dialog-overlay";
        document.body.appendChild(overlay);
      },
      destroy: () => overlay?.remove(),
    };
  },
});

const meta = {
  title: "Screens/Verification/PalmScan",
  component: VeryVerificationRoute,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof VeryVerificationRoute>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Desktop: the page opens the Very widget itself; there is no start button. */
export const Desktop: Story = {
  args: {
    url: joinUrl,
    mobile: false,
    navigate: noop,
    loadWidget: storyWidget,
    resolveCommunityAction: async () => ({ kind: "verify", intentId: "story-intent" }),
    createCeremony: openCeremony,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Join this community" })).toBeVisible();
    await expect(await canvas.findByText("Scan your palm in the Very window.")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Cancel" })).toBeVisible();
    await expect(canvas.queryByRole("textbox")).toBeNull();
  },
};

/** Phone: the page opens the Very app itself and keeps one button in case the browser refused. */
export const Phone: Story = {
  args: {
    url: joinUrl,
    mobile: true,
    navigate: noop,
    openApp: noop,
    resolveCommunityAction: async () => ({ kind: "verify", intentId: "story-intent" }),
    createCeremony: openCeremony,
  },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: "Open Very" })).toBeVisible();
    await expect(canvas.getByText("Waiting for Very. Come back here when you're done.")).toBeVisible();
    await expect(canvas.queryByRole("img")).toBeNull();
  },
};

/** The scan expired: one line says so, and the retry is the only start control. */
export const Expired: Story = {
  args: {
    url: joinUrl,
    mobile: false,
    navigate: noop,
    resolveCommunityAction: async () => ({ kind: "verify", intentId: "story-intent" }),
    createCeremony: async () => { throw new VeryWebClientError("ceremony_expired"); },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("alert")).toHaveTextContent("That scan expired. Try again.");
    await expect(canvas.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Back" })).toBeVisible();
  },
};

/** A link without its community asks for nothing and offers only Back. */
export const IncompleteLink: Story = {
  args: { url: new URL("https://pirate.example/verify/very"), navigate: noop },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("This link is incomplete. Go back and try again.");
    await expect(canvas.queryByRole("textbox")).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Try again" })).toBeNull();
  },
};

/** Already joined: the page says so and returns to the community with no second tap. */
export const Joined: Story = {
  args: {
    url: joinUrl,
    navigate: noop,
    resolveCommunityAction: async () => ({ kind: "joined" }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("You joined.")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Continue" })).toBeVisible();
  },
};
