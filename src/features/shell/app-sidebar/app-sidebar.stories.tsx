/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Button, Type } from "../../../design-system";
import { AppSidebar, SidebarContent, type SidebarSection } from "./app-sidebar";

const sections: SidebarSection[] = [
  { id: "communities", label: "Communities", items: [{ id: "your-communities", label: "Your communities" }, { id: "c-builders", label: "c/builders" }, { id: "c-signal", label: "c/signal" }] },
  { id: "discover", label: "Discover", items: [{ id: "popular", label: "Popular" }, { id: "saved", label: "Saved" }] },
];
const primary = [{ id: "home", label: "Home" }, { id: "search", label: "Search" }];
const resources = [{ id: "docs", label: "Documentation" }, { id: "help", label: "Help center" }];
const meta = { title: "Compositions/App/AppSidebar", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Content(props: { label: string }) { return <SidebarContent class="p-8"><Type as="h1" variant="h2">{props.label}</Type><div class="mt-6 h-48 rounded-2xl border border-border-soft bg-card" /></SidebarContent>; }

export const DesktopShell: Story = { render: () => <div class="flex min-h-screen"><AppSidebar activeItemId="home" brandLabel="PIRATE" primaryItems={primary} resourceItems={resources} sections={sections} /><Content label="Expanded media shell" /></div> };
export const DesktopShellWithAction: Story = { render: () => <div class="flex min-h-screen"><AppSidebar activeItemId="home" brandLabel="PIRATE" mediaAction={<Button class="w-full">Connect</Button>} primaryItems={primary} sections={sections} /><Content label="Shell with connection action" /></div> };
export const CollapsedIconRail: Story = { render: () => <div class="flex min-h-screen"><AppSidebar collapsed primaryItems={primary} sections={sections} /><Content label="Collapsed icon rail" /></div> };
export const CommunitiesOverflowing: Story = { render: () => <div class="flex min-h-screen"><AppSidebar brandLabel="PIRATE" primaryItems={primary} sections={[{ id: "communities", label: "Communities", items: Array.from({ length: 8 }, (_, index) => ({ id: `community-${index}`, label: `c/community-${index}` })) }]} /><Content label="Community list at the visible cap" /></div> };
export const MobileShell: Story = { parameters: { viewport: { defaultViewport: "mobile1" } }, render: () => <div class="flex min-h-screen"><AppSidebar class="hidden md:flex" brandLabel="PIRATE" primaryItems={primary} sections={sections} /><Content label="Mobile content shell" /></div> };

