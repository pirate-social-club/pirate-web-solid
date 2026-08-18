import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Type } from "@/components/data-display/type/type";
import { PirateBrandMark } from "@/patterns/identity/pirate-brand-mark/pirate-brand-mark";
import { IconHouse, IconPlus } from "@/components/media/icons";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "./index";

const meta = {
  title: "Patterns/Navigation/Sidebar",
  component: Sidebar,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Collapsible application sidebar with offcanvas and icon collapse modes, a mobile sheet branch, keyboard toggle (Cmd/Ctrl+B), rail, and tooltip-on-collapse menu buttons. Labels are injected props with English defaults; the host owns open-state persistence (the React version wrote a cookie inline). Locale copy is host-provided, so the React Pseudo locale story is covered by fixture text plus the direction global instead.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ height: "720px", width: "100%", "min-height": "720px" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Sidebar>;

export default meta;

type Story = StoryObj<typeof meta>;

const sectionLabelClassName =
  "px-4 pb-1.5 pt-3 text-base font-normal uppercase tracking-[0.03em] text-sidebar-foreground/32 hover:no-underline";

const navRowClassName = "h-12 rounded-xl px-4 text-base font-medium";

const fixtureSections = [
  { label: "Communities", items: ["Announcements", "General", "Releases"] },
  { label: "Resources", items: ["Docs", "Support"] },
];

function DemoSidebar(props: { side?: "left" | "right" }) {
  return (
    <Sidebar collapsible="icon" side={props.side ?? "left"}>
      <SidebarHeader class="border-b border-sidebar-border p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton class="h-12 rounded-xl px-4" size="lg" tooltip="Pirate">
              <PirateBrandMark class="size-10 shrink-0" />
              <Type as="div" variant="h4" class="grid flex-1 text-start leading-tight">
                <span class="truncate font-semibold">Pirate</span>
              </Type>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent class="gap-3 overflow-y-auto px-0 pb-4 pt-3">
        <SidebarGroup class="px-4 pt-1">
          <SidebarGroupContent>
            <SidebarMenu class="gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton class={navRowClassName} isActive tooltip="Home">
                  <IconHouse class="size-5" />
                  <span class="truncate">Home</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton class={navRowClassName} tooltip="Create community">
                  <IconPlus class="size-5" />
                  <span class="truncate">Create community</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {fixtureSections.map((section) => (
          <SidebarGroup class="gap-0 px-4 py-0 group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel class={sectionLabelClassName}>
              {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu class="gap-1">
                {section.items.map((item) => (
                  <SidebarMenuItem>
                    <SidebarMenuButton class={navRowClassName} tooltip={item}>
                      <span class="truncate">{item}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

function SidebarStoryFrame(props: { side?: "left" | "right" }) {
  return (
    <SidebarProvider>
      <DemoSidebar side={props.side} />
      <SidebarInset>
        <header class="flex h-16 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger class="-ms-1" />
          <span class="text-base font-medium">Content area</span>
        </header>
      </SidebarInset>
    </SidebarProvider>
  );
}

export const Default: Story = {
  render: () => <SidebarStoryFrame />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Toggle sidebar" });
    const sidebar = canvasElement.querySelector("[data-side]");
    await expect(sidebar).toHaveAttribute("data-state", "expanded");
    await userEvent.click(trigger);
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");
    await userEvent.keyboard("{Control>}b{/Control}");
    await expect(sidebar).toHaveAttribute("data-state", "expanded");
  },
};

export const Rtl: Story = {
  globals: {
    direction: "rtl",
  },
  render: () => <SidebarStoryFrame side="right" />,
};

export const CollapsedByDefault: Story = {
  render: () => (
    <SidebarProvider defaultOpen={false}>
      <DemoSidebar />
      <SidebarInset>
        <header class="flex h-16 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger class="-ms-1" />
          <span class="text-base font-medium">Content area</span>
        </header>
      </SidebarInset>
    </SidebarProvider>
  ),
  play: async ({ canvasElement }) => {
    const sidebar = canvasElement.querySelector("[data-side]");
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");
    await expect(sidebar).toHaveAttribute("data-collapsible", "icon");
  },
};
