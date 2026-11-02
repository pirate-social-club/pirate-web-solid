import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";
import { CommunityPage } from "./community-page.tsx";
import type { CommunityPageViewState } from "./community-page.model.ts";

const meta = {
  title: "Screens/Community/CommunityPage/Loading",
  component: CommunityPage,
  args: { pathSegment: "community_123e4567-e89b-42d3-a456-426614174000" },
  parameters: { layout: "fullscreen" },
  render: args => <CommunityPage {...args} data={new Promise<CommunityPageViewState>(() => {})} />,
} satisfies Meta<typeof CommunityPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const RouteLoading: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("status", { name: /Loading community/iu })).toBeVisible();
    await expect(canvas.getAllByRole("status")).toHaveLength(1);
    await expect(canvas.getByRole("main")).toHaveAttribute("aria-busy", "true");
    await expect(canvas.queryByText(/Loading community/iu)).not.toBeInTheDocument();
  },
};
export const PhoneRouteLoading: Story = {
  ...RouteLoading,
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
