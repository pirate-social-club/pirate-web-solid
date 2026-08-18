import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { PillButton } from "@/components/actions/pill-button/pill-button";
import { Tabs, TabsList, TabsTrigger } from "@/components/disclosure/tabs/tabs";

import {
  FlatTabBar,
  FlatTabButton,
} from "./flat-tabs";

const meta = {
  title: "Patterns/Navigation/FlatTabs",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Flat underline tab chrome for profile and feed surfaces. FlatTabBar with FlatTabButton covers callback-driven switching without a tabs provider; the shared Tabs primitives provide controlled underline tabs. Both variants keep the active underline on the primary color and stay scrollable when columns are not fixed.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const TabBarWithButtons: Story = {
  render: () => {
    const [active, setActive] = createSignal("feed");
    return (
      <div class="p-4">
        <FlatTabBar columns={2}>
          <FlatTabButton active={active() === "feed"} onClick={() => setActive("feed")}>
            Feed
          </FlatTabButton>
          <FlatTabButton active={active() === "about"} onClick={() => setActive("about")}>
            About
          </FlatTabButton>
        </FlatTabBar>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const about = canvas.getByRole("button", { name: "About" });
    await userEvent.click(about);
    await expect(about).toHaveClass("border-primary");
    await expect(canvas.getByRole("button", { name: "Feed" })).toHaveClass(
      "border-transparent",
    );
  },
};

export const TabBarWithActions: Story = {
  render: () => {
    const [active, setActive] = createSignal("feed");
    const [optionsActive, setOptionsActive] = createSignal(false);
    return (
      <div class="p-4">
        <FlatTabBar
          actions={
            <PillButton
              aria-pressed={optionsActive() ? "true" : "false"}
              onClick={() => setOptionsActive((current) => !current)}
              tone={optionsActive() ? "selected" : "default"}
            >
              Options
            </PillButton>
          }
          columns={2}
        >
          <FlatTabButton active={active() === "feed"} onClick={() => setActive("feed")}>
            Feed
          </FlatTabButton>
          <FlatTabButton active={active() === "about"} onClick={() => setActive("about")}>
            About
          </FlatTabButton>
        </FlatTabBar>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const options = canvas.getByRole("button", { name: "Options" });
    await expect(options).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(options);
    await expect(options).toHaveAttribute("aria-pressed", "true");
  },
};

export const TabsListWithTriggers: Story = {
  render: () => {
    const [value, setValue] = createSignal("tab1");
    return (
      <div class="p-4">
        <Tabs value={value()} onChange={setValue}>
          <TabsList variant="underline">
            <TabsTrigger variant="underline" value="tab1">Posts</TabsTrigger>
            <TabsTrigger variant="underline" value="tab2">Comments</TabsTrigger>
            <TabsTrigger variant="underline" value="tab3">Saved</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const posts = canvas.getByRole("tab", { name: "Posts" });
    await expect(posts).toHaveAttribute("aria-selected", "true");
    await userEvent.click(posts);
    await userEvent.keyboard("{ArrowRight}");
    await expect(
      canvas.getByRole("tab", { name: "Comments" }),
    ).toHaveAttribute("aria-selected", "true");
  },
};
