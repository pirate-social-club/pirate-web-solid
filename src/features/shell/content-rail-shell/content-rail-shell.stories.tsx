/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Type } from "../../../design-system";
import { ContentRailShell } from "./content-rail-shell";

const panel = (label: string) => <div class="rounded-2xl border border-border-soft bg-card px-5 py-4"><Type variant="caption">{label}</Type></div>;
const meta = { title: "Compositions/App/ContentRailShell", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: () => <ContentRailShell header={panel("Community header")} rail={panel("Sidebar")}>{<div class="flex flex-col gap-4">{panel("Feed item one")}{panel("Feed item two")}</div>}</ContentRailShell> };
export const WithoutHeader: Story = { render: () => <ContentRailShell rail={panel("Sidebar")}>{panel("Main content without header")}</ContentRailShell> };
export const WithoutRail: Story = { render: () => <ContentRailShell header={panel("Standalone header")}>{panel("Full-width content")}</ContentRailShell> };

