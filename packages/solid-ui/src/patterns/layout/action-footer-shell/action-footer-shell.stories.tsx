import type { JSX } from "@solidjs/web";
import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Button } from "@/components/actions/button/button";
import { Type } from "@/components/data-display/type/type";
import { ActionFooterShell } from "./action-footer-shell";

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

/** The shell needs a bounded height, so every story supplies one. */
function Bounded(props: { class?: string; children: JSX.Element }) {
  return <div class={props.class}>{props.children}</div>;
}

const meta = {
  title: "Patterns/Layout/ActionFooterShell",
  component: ActionFooterShell,
  tags: ["autodocs"],
  args: {
    footer: <Footer />,
    header: <Header />,
    children: <Paragraphs count={3} />,
  },
  argTypes: {
    class: { table: { disable: true } },
    bodyClass: { table: { disable: true } },
    footerClass: { table: { disable: true } },
  },
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "A header, a scrolling body, and a footer pinned to the bottom of the available height. The shell fills its parent, so each story wraps it in a bounded container or sets `fullViewport`." } },
  },
  render: (args) => (
    <Bounded class="h-dvh bg-background text-foreground">
      <ActionFooterShell {...args} />
    </Bounded>
  ),
} satisfies Meta<typeof ActionFooterShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Content fits",
};

export const Overflowing: Story = {
  name: "Content overflows",
  args: { children: <Paragraphs count={40} /> },
};

/**
 * The case the component exists for. On a short viewport a `sticky bottom-0`
 * footer scrolls out of reach; this one stays pinned.
 */
export const ShortViewport: Story = {
  name: "Short viewport",
  args: { children: <Paragraphs count={20} /> },
  render: (args) => (
    <Bounded class="h-[320px] border border-border bg-background text-foreground">
      <ActionFooterShell {...args} />
    </Bounded>
  ),
};

export const Mobile: Story = {
  name: "Mobile",
  args: { children: <Paragraphs count={20} />, fullViewport: true },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: (args) => <ActionFooterShell {...args} />,
};

export const NoHeader: Story = {
  name: "Without a header",
  args: { children: <Paragraphs count={12} />, header: undefined },
  render: (args) => (
    <Bounded class="h-[360px] border border-border bg-background text-foreground">
      <ActionFooterShell {...args} />
    </Bounded>
  ),
};
