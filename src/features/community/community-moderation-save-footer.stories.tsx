import type { JSX } from "@solidjs/web";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { Button, Type } from "../../design-system";
import { CommunityModerationSaveFooter } from "./community-moderation-save-footer";

/**
 * The footer is `sticky bottom-0` with `mt-auto`, so it needs a bounded flex
 * column to sit in. Every story supplies one, which is also what makes a
 * scrolling case observable.
 */
function Page(props: { children: JSX.Element; rows?: number }) {
  return (
    <div class="flex h-[420px] flex-col bg-background px-4 text-foreground">
      <div class="flex-1 overflow-y-auto py-4" tabindex="0">
        {Array.from({ length: props.rows ?? 4 }, (_, index) => (
          <Type as="p" class="py-2" variant="body">
            Moderation setting {index + 1}
          </Type>
        ))}
      </div>
      {props.children}
    </div>
  );
}

const meta = {
  title: "Parts/Community/ModerationSaveFooter",
  component: CommunityModerationSaveFooter,
  args: { onSave: () => undefined },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  render: (args) => (
    <Page>
      <CommunityModerationSaveFooter {...args} />
    </Page>
  ),
} satisfies Meta<typeof CommunityModerationSaveFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Default",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Save" })).toBeEnabled();
  },
};

export const Disabled: Story = {
  name: "Nothing to save",
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
  },
};

export const Saving: Story = {
  name: "Saving",
  args: { loading: true },
};

export const CustomLabel: Story = {
  name: "Custom primary label",
  args: { primaryLabel: "Publish rules" },
};

/** A destructive or reset action sits opposite the primary on wide viewports. */
export const WithSecondaryAction: Story = {
  name: "With a secondary action",
  args: {
    secondaryAction: (
      <Button variant="ghost">Discard changes</Button>
    ),
  },
};

/**
 * The content scrolls behind the footer. If the footer ever leaves the
 * viewport here, its sticky positioning has regressed.
 */
export const OverflowingContent: Story = {
  name: "Content overflows",
  render: (args) => (
    <Page rows={24}>
      <CommunityModerationSaveFooter {...args} />
    </Page>
  ),
};

export const Mobile: Story = {
  name: "Mobile",
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
