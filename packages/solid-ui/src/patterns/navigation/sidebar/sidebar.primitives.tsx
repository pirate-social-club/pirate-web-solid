import type { JSX } from "@solidjs/web";
import { createMemo, Show, type ParentProps } from "solid-js";

import { Button } from "@/components/actions/button/button";
import { Separator } from "@/components/data-display/separator/separator";
import { IconSidebarSimple } from "@/components/media/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/overlays/tooltip/tooltip";
import { cn } from "@/lib/cn";
import { cva, type VariantProps } from "@/lib/recipe";

import { createSidebar, createSidebarSide } from "./sidebar.shared";

export function SidebarTrigger(
  props: ParentProps<{ class?: string; label?: string; onClick?: () => void }>,
) {
  const { toggleSidebar } = createSidebar();

  return (
    <Button
      data-sidebar="trigger"
      variant="ghost"
      size="icon"
      class={cn("size-9", props.class)}
      onClick={() => {
        props.onClick?.();
        toggleSidebar();
      }}
    >
      <IconSidebarSimple class="size-5" />
      <span class="sr-only">{props.label ?? "Toggle sidebar"}</span>
    </Button>
  );
}

export function SidebarRail(props: { class?: string; label?: string }) {
  const { toggleSidebar } = createSidebar();

  return (
    <button
      data-sidebar="rail"
      aria-label={props.label ?? "Toggle sidebar"}
      tabindex={-1}
      onClick={toggleSidebar}
      title={props.label ?? "Toggle sidebar"}
      class={cn(
        "absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear after:absolute after:inset-y-0 after:start-1/2 after:w-[2px] hover:after:bg-sidebar-border group-data-[side=left]:-right-4 group-data-[side=right]:left-0 sm:flex",
        "[[data-side=left]_&]:cursor-w-resize [[data-side=right]_&]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:start-full group-data-[collapsible=offcanvas]:hover:bg-sidebar",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        props.class,
      )}
    />
  );
}

export function SidebarInset(props: ParentProps<{ class?: string }>) {
  return (
    <main
      class={cn(
        "relative flex w-full flex-1 flex-col bg-background",
        "md:peer-data-[variant=inset]:m-2 md:peer-data-[state=collapsed]:peer-data-[variant=inset]:ms-2 md:peer-data-[variant=inset]:ms-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow",
        props.class,
      )}
    >
      {props.children}
    </main>
  );
}

export function SidebarHeader(props: ParentProps<{ class?: string }>) {
  return (
    <div data-sidebar="header" class={cn("flex flex-col gap-3 p-4", props.class)}>
      {props.children}
    </div>
  );
}

export function SidebarSeparator(props: { class?: string }) {
  return (
    <Separator
      data-sidebar="separator"
      class={cn("mx-2 w-auto bg-sidebar-border", props.class)}
    />
  );
}

export function SidebarContent(props: ParentProps<{ class?: string }>) {
  return (
    <div
      data-sidebar="content"
      class={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        props.class,
      )}
    >
      {props.children}
    </div>
  );
}

export function SidebarGroup(props: ParentProps<{ class?: string }>) {
  return (
    <div
      data-sidebar="group"
      class={cn("relative flex w-full min-w-0 flex-col p-3", props.class)}
    >
      {props.children}
    </div>
  );
}

export function SidebarGroupLabel(props: ParentProps<{ class?: string }>) {
  return (
    <div
      data-sidebar="group-label"
      class={cn(
        "flex h-9 shrink-0 items-center rounded-md px-3 text-base font-medium text-sidebar-foreground/70 outline-none ring-sidebar-ring transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-5 [&>svg]:shrink-0",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        props.class,
      )}
    >
      {props.children}
    </div>
  );
}

export function SidebarGroupContent(props: ParentProps<{ class?: string }>) {
  return (
    <div data-sidebar="group-content" class={cn("w-full text-base", props.class)}>
      {props.children}
    </div>
  );
}

export function SidebarMenu(props: ParentProps<{ class?: string }>) {
  return (
    <ul
      data-sidebar="menu"
      class={cn("flex w-full min-w-0 flex-col gap-1", props.class)}
    >
      {props.children}
    </ul>
  );
}

export function SidebarMenuItem(props: ParentProps<{ class?: string }>) {
  return (
    <li data-sidebar="menu-item" class={cn("group/menu-item relative", props.class)}>
      {props.children}
    </li>
  );
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full items-center gap-3 overflow-hidden rounded-md p-2.5 text-start text-base outline-none ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-[[data-sidebar=menu-action]]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:!size-10 group-data-[collapsible=icon]:!p-2.5 [&>span:last-child]:truncate [&>svg]:size-5 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        outline:
          "bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]",
      },
      size: {
        default: "h-10 text-base",
        sm: "h-9 text-base",
        lg: "h-12 text-base group-data-[collapsible=icon]:!p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface SidebarMenuButtonProps
  extends VariantProps<typeof sidebarMenuButtonVariants> {
  children?: JSX.Element;
  class?: string;
  isActive?: boolean;
  onClick?: () => void;
  /** Collapsed-state tooltip label; rendered only when the sidebar is
      collapsed to icons on desktop. */
  tooltip?: string;
}

export function SidebarMenuButton(props: SidebarMenuButtonProps) {
  const { isMobile, state } = createSidebar();
  const side = createSidebarSide();

  const className = createMemo(() =>
    cn(
      sidebarMenuButtonVariants({ variant: props.variant, size: props.size }),
      props.class,
    ),
  );
  const showTooltip = () =>
    Boolean(props.tooltip) && state() === "collapsed" && !isMobile();

  return (
    <Show
      when={showTooltip()}
      fallback={
        <button
          data-sidebar="menu-button"
          data-size={props.size ?? "default"}
          data-active={props.isActive ?? false}
          class={className()}
          onClick={() => props.onClick?.()}
          type="button"
        >
          {props.children}
        </button>
      }
    >
      <Tooltip openDelay={0} placement={side === "right" ? "left" : "right"}>
        <TooltipTrigger
          data-sidebar="menu-button"
          data-size={props.size ?? "default"}
          data-active={props.isActive ?? false}
          class={className()}
          onClick={() => props.onClick?.()}
          type="button"
        >
          {props.children}
        </TooltipTrigger>
        <TooltipContent>{props.tooltip}</TooltipContent>
      </Tooltip>
    </Show>
  );
}
