/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Button, Type } from "../../../design-system";
import { MobileRouteShell } from "./mobile-route-shell";

const meta = { title: "Screens/Shell/MobileRouteShell", parameters: { layout: "fullscreen", viewport: { defaultViewport: "mobile2" } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: () => <MobileRouteShell title="Create post"><div class="flex flex-col gap-4"><Type as="h1" variant="h3">Draft details</Type><Type variant="body">Mobile route content sits below the fixed page header.</Type></div></MobileRouteShell> };
export const WithFooter: Story = { render: () => <MobileRouteShell title="Publish" footer={<div class="sticky bottom-0 border-t border-border-soft bg-background p-4"><Button class="w-full">Continue</Button></div>}><div class="flex flex-col gap-4"><Type as="h1" variant="h3">Review your post</Type><Type variant="body">Footer actions stay outside the scrollable route body.</Type></div></MobileRouteShell> };

