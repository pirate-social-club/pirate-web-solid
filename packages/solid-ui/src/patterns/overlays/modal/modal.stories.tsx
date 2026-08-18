import type { JSX } from "@solidjs/web";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Button } from "@/components/actions/button/button";
import { Type } from "@/components/data-display/type/type";

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
            <ModalFooter class="mt-6 border-t border-border/70 pt-4 sm:pt-5">
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
      description="Add a small amount to your wallet to unlock the full track and keep it in your library."
      forceMobile={false}
      footer={
        <>
          <Button size="lg" variant="outline">Maybe later</Button>
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
      description="Add a small amount to your wallet to unlock the full track and keep it in your library."
      forceMobile
      footer={
        <>
          <Button class="w-full" size="lg" variant="outline">Maybe later</Button>
          <Button class="w-full" size="lg">Add funds</Button>
        </>
      }
      mobileSide="bottom"
      title="Unlock this content"
    />
  ),
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
