/** @jsxImportSource @solidjs/web */
import { For, Show } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Button, Card, CardContent, Type } from "@pirate/web-solid-ui";

interface ActionCalloutProps { title: string; description?: string; actionLabel: string; helperLinks?: readonly string[]; mobile?: boolean; }
export function ActionCalloutPanel(props: ActionCalloutProps) {
  return <Card class={props.mobile ? "w-full" : "w-full max-w-4xl"} data-action-callout><CardContent class="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between md:gap-8"><div class="flex min-w-0 flex-col gap-1"><Type variant="h3">{props.title}</Type><Show when={props.description}><Type variant="body">{props.description}</Type></Show><Show when={props.helperLinks?.length}><div class="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Verification downloads"><Type variant="caption">Download verification app:</Type><For each={props.helperLinks ?? []}>{(link) => <a class="text-foreground underline underline-offset-4" href="#verification" onClick={(event) => event.preventDefault()}>{link}</a>}</For></div></Show></div><Button class="w-full shrink-0 md:w-auto" size="lg">{props.actionLabel}</Button></CardContent></Card>;
}
const meta = { title: "App/Community/ActionCalloutPanel", component: ActionCalloutPanel, args: { actionLabel: "Verify to Join", title: "Verify your identity to join" }, parameters: { layout: "centered" } } satisfies Meta<typeof ActionCalloutPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const WithPrimaryAction: Story = { render: () => <ActionCalloutPanel actionLabel="Verify to Join" description="Complete the ID check, then return to join." title="Verify your identity to join" /> };
export const WithHelperLinks: Story = { render: () => <ActionCalloutPanel actionLabel="Verify to Join" helperLinks={["iOS App Store", "Google Play"]} title="Scan your palm to join" /> };
export const Mobile: Story = { parameters: { viewport: { defaultViewport: "mobile1" } }, render: () => <ActionCalloutPanel actionLabel="Verify to Join" description="Complete the ID check, then return to join." mobile title="Verify your identity to join" /> };
