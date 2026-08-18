/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Card, Type } from "../../../design-system";
import { FullBleedMobileListSection, PublicRoutePage, StandardRoutePage, StandaloneMobilePage } from "./page-shell";

const meta = { title: "Compositions/App/PageShell", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function StoryContent(props: { bleed?: boolean }) { return <div class="flex flex-1 flex-col gap-4"><Card class="p-5"><Type as="h2" variant="h3">Page block</Type><Type variant="caption">This block aligns to the page gutter.</Type></Card>{props.bleed ? <FullBleedMobileListSection class="border-y border-border-soft bg-card"><Type as="div" variant="label" class="px-5 py-3">Full-bleed list section</Type>{["top", "middle", "bottom"].map((row) => <div class="flex items-center gap-3 border-b border-border-soft px-5 py-4" data-row={row}><div class="size-8 rounded-full bg-muted" /><Type variant="caption">{row} row</Type></div>)}</FullBleedMobileListSection> : null}<Card class="p-5"><Type variant="caption">Another block aligned to the gutter.</Type></Card></div>; }

export const StandardRouteDesktop: Story = { render: () => <div class="min-h-screen bg-background"><StandardRoutePage size="rail"><StoryContent bleed /></StandardRoutePage></div> };
export const StandardRouteMobile: Story = { parameters: { viewport: { defaultViewport: "mobile1" } }, render: () => <div class="min-h-screen bg-background"><StandardRoutePage size="rail"><StoryContent bleed /></StandardRoutePage></div> };
export const StandaloneMobile: Story = { parameters: { viewport: { defaultViewport: "mobile1" } }, render: () => <StandaloneMobilePage title="Settings" onBack={() => undefined}><div class="flex flex-1 flex-col gap-4 px-[var(--page-gutter-x)] py-4"><Card class="p-5"><Type variant="body">Standalone mobile page content.</Type></Card></div></StandaloneMobilePage> };
export const PublicRouteDesktop: Story = { render: () => <PublicRoutePage><div class="flex flex-col gap-4 py-6"><Card class="p-5"><Type variant="body">Public route content.</Type></Card></div></PublicRoutePage> };
export const PublicRouteMobile: Story = { parameters: { viewport: { defaultViewport: "mobile1" } }, render: () => <PublicRoutePage><div class="flex flex-col gap-4 py-6"><Card class="p-5"><Type variant="body">Public route content.</Type></Card></div></PublicRoutePage> };

