import type { JSX } from "@solidjs/web";
import {
  createContext,
  Show,
  useContext,
  type Accessor,
  type ParentProps,
} from "solid-js";

import { createClientHydrated } from "@/lib/hydration";
import { createIsMobile } from "@/lib/media-query";
import { cn } from "@/lib/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/overlays/dialog/dialog";
import {
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/overlays/sheet/sheet";
import {
  type TypeProps,
  typeVariants,
} from "@/components/data-display/type/type";

const ModalResponsiveContext = createContext<Accessor<boolean>>();

export const ModalTrigger = DialogTrigger;

function createModalIsMobile(): Accessor<boolean> {
  return useContext(ModalResponsiveContext);
}

export interface ModalProps {
  children?: JSX.Element;
  forceMobile?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  defaultOpen?: boolean;
  modal?: boolean;
}

/**
 * Responsive modal root: renders its content as a centered Dialog on desktop
 * and a Sheet (bottom sheet by default) on mobile. Mobile detection is
 * hydration-gated so SSR always renders the desktop branch; forceMobile
 * overrides detection for stories and tests.
 */
export function Modal(props: ParentProps<ModalProps>) {
  const detectedMobile = createIsMobile();
  const hydrated = createClientHydrated();
  const isMobile = () => props.forceMobile ?? (hydrated() ? detectedMobile() : false);

  const rootProps = () =>
    ({
      open: props.open,
      defaultOpen: props.defaultOpen,
      onOpenChange: props.onOpenChange,
      modal: props.modal,
    }) as const;

  return (
    <ModalResponsiveContext value={isMobile}>
      <Dialog {...rootProps()}>{props.children}</Dialog>
    </ModalResponsiveContext>
  );
}

export interface ModalContentProps {
  children?: JSX.Element;
  class?: string;
  dir?: "ltr" | "rtl" | "auto";
  hideCloseButton?: boolean;
  hideCloseButtonOnMobile?: boolean;
  mobileSide?: "top" | "bottom" | "left" | "right";
}

export function ModalContent(props: ParentProps<ModalContentProps>) {
  const isMobile = createModalIsMobile();
  const shouldHideCloseButton = () =>
    props.hideCloseButton || (isMobile() && (props.hideCloseButtonOnMobile ?? false));

  return (
    <Show
      when={isMobile()}
      fallback={
        <DialogContent dir={props.dir} class={props.class} hideCloseButton={shouldHideCloseButton()}>
          {props.children}
        </DialogContent>
      }
    >
      <SheetContent
        dir={props.dir}
        class={props.class}
        hideCloseButton={shouldHideCloseButton()}
        side={props.mobileSide ?? "bottom"}
      >
        {props.children}
      </SheetContent>
    </Show>
  );
}

export function ModalHeader(props: ParentProps<{ class?: string }>) {
  const isMobile = createModalIsMobile();
  return (
    <Show
      when={isMobile()}
      fallback={<DialogHeader class={props.class}>{props.children}</DialogHeader>}
    >
      <SheetHeader class={props.class}>{props.children}</SheetHeader>
    </Show>
  );
}

export function ModalFooter(props: ParentProps<{ class?: string }>) {
  const isMobile = createModalIsMobile();
  return (
    <Show
      when={isMobile()}
      fallback={<DialogFooter class={props.class}>{props.children}</DialogFooter>}
    >
      <SheetFooter class={props.class}>{props.children}</SheetFooter>
    </Show>
  );
}

export interface ModalTypographyProps
  extends Pick<TypeProps, "leading" | "variant"> {
  class?: string;
}

export function ModalTitle(props: ParentProps<ModalTypographyProps>) {
  const isMobile = createModalIsMobile();
  const className = () =>
    cn(
      typeVariants({
        leading: props.leading,
        variant: props.variant ?? "h3",
      }),
      props.class,
    );
  return (
    <Show
      when={isMobile()}
      fallback={<DialogTitle class={className()}>{props.children}</DialogTitle>}
    >
      <SheetTitle class={className()}>{props.children}</SheetTitle>
    </Show>
  );
}

export function ModalDescription(props: ParentProps<ModalTypographyProps>) {
  const isMobile = createModalIsMobile();
  const className = () =>
    cn(
      props.variant || props.leading
        ? typeVariants({
            leading: props.leading,
            variant: props.variant,
          })
        : undefined,
      props.class,
    );
  return (
    <Show
      when={isMobile()}
      fallback={<DialogDescription class={className()}>{props.children}</DialogDescription>}
    >
      <SheetDescription class={className()}>{props.children}</SheetDescription>
    </Show>
  );
}
