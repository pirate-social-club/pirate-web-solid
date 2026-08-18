import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { Type } from "@/components/data-display/type/type";

import { AvatarBadge } from "./avatar-badge";

// Offline, deterministic flag fixtures: colored circle SVGs keyed by country
// code, standing in for the deterministic local default artwork.
const fixtureFlag = (code: string) => {
  const colors: Record<string, string> = {
    ar: "#006c35",
    br: "#009739",
    cn: "#de2910",
    gb: "#012169",
    in: "#ff9933",
    us: "#3c3b6e",
  };
  const fill = colors[code] ?? "#666666";
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="${fill}"/></svg>`,
  )}`;
};

const meta = {
  title: "Patterns/Identity/AvatarBadge",
  component: AvatarBadge,
  parameters: {
    docs: {
      description: {
        component:
          "Avatar with a corner verification badge. A valid two-letter badgeCountryCode renders deterministic local artwork by default; flagUrlForCountryCode and badgeSrc remain explicit overrides for supplied artwork. Anything else renders the plain Avatar. Badge size, ring, and offset follow the avatar size unless overridden.",
      },
    },
  },
  args: {
    badgeCountryCode: "us",
    badgeLabel: "Verified United States nationality",
    fallback: "Ada Lovelace",
    flagUrlForCountryCode: fixtureFlag,
    size: "md",
  },
  argTypes: {
    size: {
      control: "select",
      options: ["sm", "md", "lg"],
    },
  },
} satisfies Meta<typeof AvatarBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("img", { name: "Verified United States nationality" }),
    ).toBeVisible();
  },
};

export const Sizes: Story = {
  render: () => (
    <div class="flex items-end gap-5">
      <AvatarBadge badgeCountryCode="br" badgeLabel="Verified Brazil nationality" fallback="Brazil" flagUrlForCountryCode={fixtureFlag} size="sm" />
      <AvatarBadge badgeCountryCode="cn" badgeLabel="Verified China nationality" fallback="China" flagUrlForCountryCode={fixtureFlag} size="md" />
      <AvatarBadge badgeCountryCode="gb" badgeLabel="Verified United Kingdom nationality" fallback="United Kingdom" flagUrlForCountryCode={fixtureFlag} size="lg" />
      <AvatarBadge
        avatarClass="size-28 border-4 border-background bg-card"
        badgeCountryCode="in"
        badgeLabel="Verified India nationality"
        badgeSize={42}
        fallback="India"
        flagUrlForCountryCode={fixtureFlag}
        size="lg"
      />
    </div>
  ),
};

export const ContextScale: Story = {
  render: () => (
    <div class="grid gap-6 sm:grid-cols-2">
      <div class="space-y-2">
        <Type as="div" variant="label">Compact avatar</Type>
        <div class="flex items-center gap-3">
          <AvatarBadge badgeCountryCode="us" badgeLabel="Verified United States nationality" fallback="Post author" flagUrlForCountryCode={fixtureFlag} size="sm" />
          <div class="text-base text-muted-foreground">36px avatar / 18px flag</div>
        </div>
      </div>
      <div class="space-y-2">
        <Type as="div" variant="label">Post and thread</Type>
        <div class="flex items-center gap-3">
          <AvatarBadge badgeCountryCode="gb" badgeLabel="Verified United Kingdom nationality" fallback="Medium author" flagUrlForCountryCode={fixtureFlag} size="md" />
          <div class="text-base text-muted-foreground">48px avatar / 22px flag</div>
        </div>
      </div>
      <div class="space-y-2">
        <Type as="div" variant="label">Large identity</Type>
        <div class="flex items-center gap-3">
          <AvatarBadge badgeCountryCode="br" badgeLabel="Verified Brazil nationality" fallback="Large author" flagUrlForCountryCode={fixtureFlag} size="lg" />
          <div class="text-base text-muted-foreground">56px avatar / 26px flag</div>
        </div>
      </div>
      <div class="space-y-2">
        <Type as="div" variant="label">Profile hero</Type>
        <div class="flex items-center gap-3">
          <AvatarBadge
            avatarClass="size-28 border-4 border-background bg-card"
            badgeCountryCode="ar"
            badgeLabel="Verified Argentina nationality"
            badgeSize={42}
            fallback="Profile owner"
            flagUrlForCountryCode={fixtureFlag}
            size="lg"
          />
          <div class="text-base text-muted-foreground">112px avatar / 42px flag</div>
        </div>
      </div>
    </div>
  ),
};

export const NoBadge: Story = {
  args: {
    badgeCountryCode: null,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("img", { name: /Verified/ }),
    ).not.toBeInTheDocument();
  },
};
