import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

const meta = {
  title: "Components/Disclosure/Tabs",
  component: Tabs,
  tags: ["autodocs"],
  args: {
    defaultValue: "account",
  },
  argTypes: {
    defaultValue: { control: "text" },
    orientation: {
      control: "select",
      options: ["horizontal", "vertical"],
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Tabbed panes built on the Kobalte Tabs. Compose `Tabs` with `TabsList`, `TabsTrigger` (value per trigger), and `TabsContent` (value per pane). Keyboard: arrow keys move between triggers, Home/End jump to the ends.",
      },
    },
  },
} satisfies Meta<typeof Tabs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div class="w-[calc(100vw-2rem)] max-w-full p-4">
      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
        </TabsList>
        <TabsContent value="account">
          <p class="text-base text-muted-foreground">
            Update your account.
          </p>
        </TabsContent>
        <TabsContent value="password">
          <p class="text-base text-muted-foreground">
            Change your password.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  ),
};

export const Interaction: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const account = canvas.getByRole("tab", { name: "Account" });
    await userEvent.click(account);
    await userEvent.keyboard("{ArrowRight}");
    await expect(
      canvas.getByRole("tab", { name: "Password" }),
    ).toHaveAttribute("aria-selected", "true");
  },
};

export const LongContent: Story = {
  render: () => (
    <Tabs defaultValue="tab1">
      <TabsList>
        <TabsTrigger value="tab1">Overview</TabsTrigger>
        <TabsTrigger value="tab2">Analytics</TabsTrigger>
        <TabsTrigger value="tab3">Reports</TabsTrigger>
        <TabsTrigger value="tab4">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">
        <p class="text-base">Overview content</p>
      </TabsContent>
      <TabsContent value="tab2">
        <p class="text-base">Analytics content</p>
      </TabsContent>
      <TabsContent value="tab3">
        <p class="text-base">Reports content</p>
      </TabsContent>
      <TabsContent value="tab4">
        <p class="text-base">Settings content</p>
      </TabsContent>
    </Tabs>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Tabs defaultValue="active">
      <TabsList>
        <TabsTrigger value="active">Active</TabsTrigger>
        <TabsTrigger value="locked" disabled>
          Locked
        </TabsTrigger>
      </TabsList>
      <TabsContent value="active">
        <p class="text-base">Active content</p>
      </TabsContent>
      <TabsContent value="locked">
        <p class="text-base">Locked content</p>
      </TabsContent>
    </Tabs>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("tab", { name: "Locked" }),
    ).toBeDisabled();
  },
};
