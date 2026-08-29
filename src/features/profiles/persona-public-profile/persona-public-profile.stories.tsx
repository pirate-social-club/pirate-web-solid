import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { PersonaPublicProfile } from "./persona-public-profile";
import type {
  PersonaPublicProfileState,
  PersonaPublicProfileSuccess,
} from "./persona-public-profile.model";

const persona = {
  persona_id: "persona_night_shift",
  object: "persona",
  display_name: "Night Shift",
  avatar_ref: null,
  primary_public_handle: "nightshift.pirate",
} as const;

const grant: PersonaPublicProfileSuccess["response"]["handle_grants"][number] = {
  grant_id: "grant_1",
  grant_generation: 1,
  community_id: "cmty_night_shift",
  owner_persona: persona,
  sale_namespace_activation_id: "act_1",
  sale_namespace_activation_generation: 1,
  fulfillment: { kind: "hosted_persona_v1" },
  handle: { family: "hns", namespace_root: "nightshift", handle_label: "aster" },
  display_identifier: "aster.nightshift",
  host: { kind: "not_applicable" },
  issued_at: "2026-08-20T10:00:00.000Z",
};

function success(
  response: Partial<PersonaPublicProfileSuccess["response"]> = {},
): PersonaPublicProfileState {
  return {
    kind: "success",
    status: 200,
    canonicalUrl: "https://pirate.sc/p/persona_night_shift",
    response: {
      persona,
      profile: { revision: 3, cover_ref: null, bio: "Late-night sets and long-form mixes." },
      handle_grants: [grant],
      ...response,
    },
  };
}

const meta = {
  title: "Screens/Profiles/PersonaPublicProfile",
  component: PersonaPublicProfile,
  args: { state: success() },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof PersonaPublicProfile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Success",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Night Shift" })).toBeInTheDocument();
    await expect(canvas.getByRole("list", { name: "Names" })).toBeInTheDocument();
  },
};

/** No bio and no names: the page still has a heading and a canonical link. */
export const Minimal: Story = {
  name: "No bio or names",
  args: {
    state: success({
      profile: { revision: 1, cover_ref: null, bio: null },
      handle_grants: [],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("list", { name: "Names" })).toBeNull();
  },
};

/** With no display name the primary handle stands in for it. */
export const HandleAsName: Story = {
  name: "Falls back to the handle",
  args: {
    state: success({ persona: { ...persona, display_name: null } }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "nightshift.pirate" })).toBeInTheDocument();
  },
};

export const NotFound: Story = {
  name: "Not found",
  args: { state: { kind: "not-found", status: 404 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("This profile is not available.");
  },
};

export const Invalid: Story = {
  name: "Invalid address",
  args: { state: { kind: "invalid", status: 400 } },
};

export const MethodNotAllowed: Story = {
  name: "Read-only",
  args: { state: { kind: "method-not-allowed", status: 405 } },
};

export const Unavailable: Story = {
  name: "Unavailable",
  args: { state: { kind: "unavailable", status: 502 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("The profile could not be loaded.");
  },
};

export const Mobile: Story = {
  name: "Mobile",
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
