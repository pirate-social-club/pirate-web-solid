import type { JSX } from "@solidjs/web";
import {
  createEffect,
  createSignal,
  Show,
  onCleanup,
  type ParentProps,
} from "solid-js";

import { createClientHydrated } from "@/lib/hydration";
import { createIsMobile } from "@/lib/media-query";
import { cn } from "@/lib/cn";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/overlays/sheet/sheet";

import {
  SIDEBAR_KEYBOARD_SHORTCUT,
  SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_ICON,
  SIDEBAR_WIDTH_MOBILE,
  SIDEBAR_WIDTH_MOBILE_VARIABLE,
  SidebarContext,
  SidebarSideContext,
  createSidebar,
} from "./sidebar.shared";

export interface SidebarProviderProps {
  children?: JSX.Element;
  class?: string;
  defaultOpen?: boolean;
  /** Controlled open state for the desktop sidebar. */
  open?: boolean;
  /** Called whenever the open state changes; the host owns persistence
      (the React version wrote a cookie inline — here persistence is a
      deliberate host concern so the pattern stays side-effect free). */
  onOpenChange?: (open: boolean) => void;
}

export function SidebarProvider(props: SidebarProviderProps) {
  const detectedMobile = createIsMobile();
  const hydrated = createClientHydrated();
  const isMobile = () => (hydrated() ? detectedMobile() : false);
  const [openMobile, setOpenMobile] = createSignal(false);
  const [openState, setOpenState] = createSignal(props.defaultOpen ?? true);
  const open = () => props.open ?? openState();

  const setOpen = (next: boolean) => {
    if (props.onOpenChange) {
      props.onOpenChange(next);
    } else {
      setOpenState(next);
    }
  };

  const toggleSidebar = () => {
    if (isMobile()) {
      setOpenMobile((current) => !current);
    } else {
      setOpen(!open());
    }
  };

  createEffect(
    () => SIDEBAR_KEYBOARD_SHORTCUT,
    (shortcut) => {
      if (typeof window === "undefined") return;
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === shortcut && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          toggleSidebar();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
    },
  );

  const state = () => (open() ? "expanded" : "collapsed");

  const wrapperStyle = () =>
    `--sidebar-width: ${SIDEBAR_WIDTH}; ${SIDEBAR_WIDTH_MOBILE_VARIABLE}: ${SIDEBAR_WIDTH_MOBILE}; --sidebar-width-icon: ${SIDEBAR_WIDTH_ICON};`;

  return (
    <SidebarContext
      value={{
        state,
        open,
        setOpen,
        openMobile,
        setOpenMobile,
        isMobile,
        toggleSidebar,
      }}
    >
      <div
        style={wrapperStyle()}
        class={cn(
          "group/sidebar-wrapper flex min-h-svh w-full has-[[data-variant=inset]]:bg-sidebar",
          props.class,
        )}
      >
        {props.children}
      </div>
    </SidebarContext>
  );
}

export interface SidebarProps {
  children?: JSX.Element;
  class?: string;
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
  /** Accessible title for the mobile sheet. */
  mobileTitle?: string;
  /** Accessible description for the mobile sheet. */
  mobileDescription?: string;
}

export function Sidebar(props: SidebarProps) {
  const { isMobile, state, openMobile, setOpenMobile } = createSidebar();
  const side = () => props.side ?? "left";
  const variant = () => props.variant ?? "sidebar";
  const collapsible = () => props.collapsible ?? "offcanvas";
  // Kobalte's SheetContent props do not type `style`; forward the mobile
  // width variable through a non-fresh spread so it reaches the DOM.
  const mobileWidthProps = () => ({
    style: `--sidebar-width: var(${SIDEBAR_WIDTH_MOBILE_VARIABLE})`,
  });

  return (
    <SidebarSideContext value={side()}>
      <Show
        when={collapsible() !== "none"}
        fallback={
          <div
            class={cn(
              "flex h-full w-[var(--sidebar-width)] flex-col bg-sidebar text-sidebar-foreground",
              props.class,
            )}
          >
            {props.children}
          </div>
        }
      >
        <Show
          when={!isMobile()}
          fallback={
            <Sheet open={openMobile()} onOpenChange={setOpenMobile}>
              <SheetContent
                data-sidebar="sidebar"
                data-mobile="true"
                class="w-[var(--sidebar-width)] bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
                side={side()}
                {...mobileWidthProps()}
              >
                <SheetHeader class="sr-only">
                  <SheetTitle>{props.mobileTitle ?? "Sidebar"}</SheetTitle>
                  <SheetDescription>
                    {props.mobileDescription ?? "Displays the mobile sidebar."}
                  </SheetDescription>
                </SheetHeader>
                <div class="flex h-full w-full flex-col">{props.children}</div>
              </SheetContent>
            </Sheet>
          }
        >
          <div
            class="group peer hidden text-sidebar-foreground md:block"
            data-state={state()}
            data-collapsible={state() === "collapsed" ? collapsible() : ""}
            data-variant={variant()}
            data-side={side()}
          >
            <div
              class={cn(
                "relative w-[var(--sidebar-width)] bg-transparent transition-[width] duration-200 ease-linear",
                "group-data-[collapsible=offcanvas]:w-0",
                "group-data-[side=right]:rotate-180",
                variant() === "floating" || variant() === "inset"
                  ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_1rem)]"
                  : "group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)]",
              )}
            />
            <div
              class={cn(
                "fixed inset-y-0 z-10 hidden h-svh w-[var(--sidebar-width)] transition-[left,right,width] duration-200 ease-linear md:flex",
                side() === "left"
                  ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
                  : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
                variant() === "floating" || variant() === "inset"
                  ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_1rem_+_2px)]"
                  : "group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)] group-data-[side=left]:border-r group-data-[side=right]:border-l",
                props.class,
              )}
            >
              <div
                data-sidebar="sidebar"
                class="flex h-full w-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow"
              >
                {props.children}
              </div>
            </div>
          </div>
        </Show>
      </Show>
    </SidebarSideContext>
  );
}
