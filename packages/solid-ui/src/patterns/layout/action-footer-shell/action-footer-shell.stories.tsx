import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Button } from "@/components/actions/button/button";
import { Type } from "@/components/data-display/type/type";
import { ActionFooterShell } from "./action-footer-shell";

const meta = {
  title: "Patterns/Layout/ActionFooterShell",
  component: ActionFooterShell,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ActionFooterShell>;

export default meta;
type Story = StoryObj<typeof meta>;

function Header() {
  return (
    <div class="border-b border-border-soft px-4 py-3">
      <Type as="h1" variant="body-strong">
        Create community
      </Type>
    </div>
  );
}

function Footer() {
  return (
    <Button class="w-full" size="lg">
      Create community
    </Button>
  );
}

function Paragraphs(props: { count: number }) {
  return (
    <div class="flex flex-col gap-4 px-4 py-5">
      <For each={Array.from({ length: props.count }, (_, index) => index)}>
        {(index) => (
          <Type as="p" variant="body">
            Paragraph {index + 1}. The body scrolls; the footer does not.
          </Type>
        )}
      </For>
    </div>
  );
}

export const Default: Story = {
  name: "Content fits",
  render: () => (
    <div class="h-dvh bg-background text-foreground">
      <ActionFooterShell footer={<Footer />} header={<Header />}>
        <Paragraphs count={3} />
      </ActionFooterShell>
    </div>
  ),
};

export const Overflowing: Story = {
  name: "Content overflows",
  render: () => (
    <div class="h-dvh bg-background text-foreground">
      <ActionFooterShell footer={<Footer />} header={<Header />}>
        <Paragraphs count={40} />
      </ActionFooterShell>
    </div>
  ),
};

/**
 * The case the component exists for. On a short viewport a `sticky bottom-0`
 * footer scrolls out of reach; this one stays pinned.
 */
export const ShortViewport: Story = {
  name: "Short viewport",
  render: () => (
    <div class="h-[320px] border border-border bg-background text-foreground">
      <ActionFooterShell footer={<Footer />} header={<Header />}>
        <Paragraphs count={20} />
      </ActionFooterShell>
    </div>
  ),
};

export const Mobile: Story = {
  name: "Mobile",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => (
    <ActionFooterShell footer={<Footer />} fullViewport header={<Header />}>
      <Paragraphs count={20} />
    </ActionFooterShell>
  ),
};

export const NoHeader: Story = {
  name: "Without a header",
  render: () => (
    <div class="h-[360px] border border-border bg-background text-foreground">
      <ActionFooterShell footer={<Footer />}>
        <Paragraphs count={12} />
      </ActionFooterShell>
    </div>
  ),
};
