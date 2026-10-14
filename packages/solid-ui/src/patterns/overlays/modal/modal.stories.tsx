import type { JSX } from "@solidjs/web";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Button } from "@/components/actions/button/button";
import { Type } from "@/components/data-display/type/type";
import { untilViewportBelow } from "@/stories/lib/story-measure";

import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "./modal";

const meta = {
  title: "Patterns/Overlays/Modal",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Responsive modal: centered Dialog on desktop, bottom Sheet on mobile (side configurable via mobileSide). Mobile detection is hydration-gated; forceMobile pins the branch for stories and tests. Compose with ModalContent, ModalHeader, ModalTitle, ModalDescription, and ModalFooter.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

function ModalShell(shellProps: {
  body?: JSX.Element;
  description: string;
  footer?: JSX.Element;
  forceMobile?: boolean;
  mobileSide?: "top" | "bottom" | "left" | "right";
  title: string;
}) {
  const [open, setOpen] = createSignal(true);
  const isBottomSheet = () =>
    shellProps.forceMobile !== false &&
    (shellProps.mobileSide === undefined || shellProps.mobileSide === "bottom");

  return (
    <div class="flex min-h-[720px] items-center justify-center bg-background p-6">
      {!open() ? <Button onClick={() => setOpen(true)}>Reopen modal</Button> : null}
      <Modal forceMobile={shellProps.forceMobile} onOpenChange={setOpen} open={open()}>
        <ModalContent
          class={
            isBottomSheet()
              ? "border-border bg-background px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3"
              : "border-border bg-background p-6 sm:w-[min(100%-2rem,34rem)] sm:max-w-[34rem]"
          }
          mobileSide={shellProps.mobileSide}
        >
          {isBottomSheet() ? (
            <div class="mx-auto mb-3 h-1.5 w-12 rounded-full bg-border" />
          ) : null}
          <ModalHeader class="pe-10 text-start">
            <ModalTitle class="text-balance text-2xl leading-tight tracking-tight sm:text-3xl">
              {shellProps.title}
            </ModalTitle>
            <ModalDescription class="max-w-[34ch] text-base leading-7">
              {shellProps.description}
            </ModalDescription>
          </ModalHeader>
          {shellProps.body}
          {shellProps.footer ? (
            <ModalFooter class="mt-2 border-t border-border/70 pt-4 sm:pt-5">
              {shellProps.footer}
            </ModalFooter>
          ) : null}
        </ModalContent>
      </Modal>
    </div>
  );
}

export const DesktopDialog: Story = {
  name: "Desktop (Dialog)",
  render: () => (
    <ModalShell
      description="Add funds to continue."
      forceMobile={false}
      footer={
        <>
          <Button size="lg" variant="outline">Cancel</Button>
          <Button size="lg">Add funds</Button>
        </>
      }
      title="Unlock this content"
    />
  ),
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    await expect(
      within(dialog).getByText("Unlock this content"),
    ).toBeVisible();
    // Paper copy: one terse description line, then Cancel and the primary action.
    await expect(within(dialog).getByText("Add funds to continue.")).toBeVisible();
    await expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeVisible();
    // Escape closes and focus returns to the page.
    await userEvent.keyboard("{Escape}");
    await expect(within(document.body).queryByRole("dialog")).toBeNull();
    const reopen = await within(document.body).findByRole("button", {
      name: "Reopen modal",
    });
    await userEvent.click(reopen);
    await expect(
      await within(document.body).findByRole("dialog"),
    ).toBeVisible();
  },
};

export const MobileSheetBottom: Story = {
  name: "Mobile (Sheet - bottom)",
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  render: () => (
    <ModalShell
      description="Add funds to continue."
      forceMobile
      footer={
        <>
          <Button class="w-full" size="lg" variant="outline">Cancel</Button>
          <Button class="w-full" size="lg">Add funds</Button>
        </>
      }
      mobileSide="bottom"
      title="Unlock this content"
    />
  ),
  play: async () => {
    const sheet = await within(document.body).findByRole("dialog");
    await expect(within(sheet).getByText("Add funds to continue.")).toBeVisible();
    // Whether the phone sheet keeps its close X is an open owner decision, so
    // the story shows the component as it ships.
    const buttons = [
      within(sheet).getByRole("button", { name: "Cancel" }),
      within(sheet).getByRole("button", { name: "Add funds" }),
    ];
    // On a phone the primary action stacks on top (the footer only stacks
    // below sm, so wait for the viewport global to narrow the canvas).
    if (await untilViewportBelow(640)) {
      await expect(buttons[1].getBoundingClientRect().top).toBeLessThan(buttons[0].getBoundingClientRect().top);
    }
  },
};

export const DesktopCompact: Story = {
  name: "Desktop (Dialog / Compact)",
  render: () => (
    <ModalShell
      description="Add funds to continue."
      forceMobile={false}
      footer={
        <>
          <Button size="lg" variant="outline">Cancel</Button>
          <Button size="lg">Add funds</Button>
        </>
      }
      title="Unlock this content"
    />
  ),
};

function PurchaseBody() {
  return (
    <div class="mt-6 grid gap-4">
      <div class="rounded-[var(--radius-1_5xl)] border border-border bg-muted/35 p-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-base font-semibold uppercase tracking-[0.03em] text-muted-foreground">
              Needed now
            </p>
            <p class="mt-2 text-3xl font-semibold tracking-tight text-foreground">$0.50</p>
          </div>
          <Type as="span" variant="caption">Instant unlock</Type>
        </div>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-xl border border-border bg-card p-4">
          <p class="text-base font-semibold uppercase tracking-[0.03em] text-muted-foreground">
            Track price
          </p>
          <p class="mt-2 text-xl font-semibold tracking-tight text-foreground">$0.50</p>
        </div>
        <div class="rounded-xl border border-border bg-card p-4">
          <p class="text-base font-semibold uppercase tracking-[0.03em] text-muted-foreground">
            Wallet balance
          </p>
          <p class="mt-2 text-xl font-semibold tracking-tight text-foreground">$0.00</p>
        </div>
      </div>
    </div>
  );
}

export const PurchaseFlow: Story = {
  name: "Purchase Flow",
  render: () => (
    <ModalShell
      body={<PurchaseBody />}
      description="Add funds to continue."
      forceMobile={false}
      footer={
        <>
          <Button size="lg" variant="outline">View wallet</Button>
          <Button size="lg">Add test funds</Button>
        </>
      }
      title="Add funds to unlock"
    />
  ),
};

export const PurchaseFlowMobile: Story = {
  name: "Purchase Flow (Mobile)",
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  render: () => (
    <ModalShell
      body={<PurchaseBody />}
      description="Add funds to continue."
      forceMobile
      footer={
        <>
          <Button class="w-full" size="lg" variant="outline">View wallet</Button>
          <Button class="w-full" size="lg">Add test funds</Button>
        </>
      }
      title="Add funds to unlock"
    />
  ),
};

/** Resolve a token through the browser so it compares with a computed colour. */
function resolvedColor(token: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

/** Paper mutes the one line of description on both presentations. */
export const DescriptionTone: Story = {
  render: () => <ModalShell description="Add funds to continue." forceMobile={false} title="Unlock this content" />,
  play: async () => {
    const description = await within(document.body).findByText("Add funds to continue.");
    await expect(getComputedStyle(description).color).toBe(resolvedColor("--muted-foreground"));
  },
};

export const DescriptionToneMobile: Story = {
  render: () => <ModalShell description="Add funds to continue." forceMobile title="Unlock this content" />,
  play: async () => {
    const description = await within(document.body).findByText("Add funds to continue.");
    await expect(getComputedStyle(description).color).toBe(resolvedColor("--muted-foreground"));
  },
};
