/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import {
  IconBell,
  IconBroadcast,
  IconHouse,
  IconMagnifyingGlass,
  IconMicrophone,
  IconUsersThree,
  Type,
} from "../../../design-system";
import { AppSidebar, SidebarContent, type SidebarItem, type SidebarSection } from "./app-sidebar";

const meta = {
  title: "Parts/Shell/AppSidebar",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

// Mirror the sections and items the production media shell passes, so this
// story shows the sidebar users actually get.
const primaryItems: readonly SidebarItem[] = [
  { id: "home", label: "Home", icon: <IconHouse class="size-5" /> },
  { id: "search", label: "Search", icon: <IconMagnifyingGlass class="size-5" /> },
  { id: "live", label: "Live", icon: <IconBroadcast class="size-5" /> },
];
const sections: readonly SidebarSection[] = [
  {
    id: "community",
    label: "Community",
    items: [
      { id: "activity", label: "Activity", icon: <IconBell class="size-5" /> },
      { id: "your-communities", label: "Your communities", icon: <IconUsersThree class="size-5" /> },
    ],
  },
  {
    id: "create",
    label: "Create",
    items: [
      { id: "create-community", label: "Create community", icon: <IconUsersThree class="size-5" /> },
      { id: "karaoke", label: "Karaoke", icon: <IconMicrophone class="size-5" /> },
    ],
  },
];

export const Default: Story = {
  render: () => (
    <div class="flex min-h-screen">
      <AppSidebar
        activeItemId="home"
        appearance="media"
        brandLabel="PIRATE"
        class="sticky top-0 hidden h-screen md:flex"
        footerActionHref="/settings"
        footerActionLabel="Account settings"
        footerDetail="Session active"
        onNavigate={() => {}}
        primaryItems={primaryItems}
        sections={sections}
      />
      <SidebarContent class="p-8">
        <Type as="h1" variant="h2">Desktop sidebar</Type>
        <div class="mt-6 h-48 rounded-2xl border border-border-soft bg-card" />
      </SidebarContent>
    </div>
  ),
};
