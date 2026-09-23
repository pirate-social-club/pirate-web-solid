/** @jsxImportSource @solidjs/web */
import { For, Show, createUniqueId } from "solid-js";
import type { JSX } from "@solidjs/web";

import { IconList, Type, cn } from "../../../design-system";

export interface SidebarItem {
  id: string;
  label: string;
  href?: string;
  icon?: JSX.Element;
  badge?: string;
}

export interface SidebarSection {
  id: string;
  label: string;
  items: readonly SidebarItem[];
  defaultOpen?: boolean;
  action?: JSX.Element;
}

export interface AppSidebarProps {
  activeItemId?: string;
  appearance?: "default" | "media";
  brandLabel?: string;
  homeAriaLabel?: string;
  primaryItems?: readonly SidebarItem[];
  resourceItems?: readonly SidebarItem[];
  resourcesLabel?: string;
  sections?: readonly SidebarSection[];
  class?: string;
  collapsed?: boolean;
  mediaAction?: JSX.Element;
  footer?: JSX.Element;
  onHomeClick?: () => void;
  onNavigate?: (id: string) => void;
}

function SidebarLink(props: { item: SidebarItem; active?: boolean; onNavigate?: (id: string) => void }) {
  const content = () => <><Show when={props.item.icon} fallback={<IconList class="size-5" />}>{props.item.icon}</Show><Type as="span" variant="body" class="min-w-0 flex-1 truncate">{props.item.label}</Type></>;
  const classes = () => cn("flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-start text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", props.active && "bg-sidebar-accent text-sidebar-accent-foreground");
  return <Show when={props.item.href} fallback={<button aria-current={props.active ? "page" : undefined} class={classes()} onClick={() => props.onNavigate?.(props.item.id)} type="button">{content()}</button>}>
    <a href={props.item.href} aria-current={props.active ? "page" : undefined} class={classes()} onClick={event => {
      if (!props.onNavigate || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      props.onNavigate(props.item.id);
    }}>{content()}</a>
  </Show>;
}

export function AppSidebar(props: AppSidebarProps) {
  const headingId = createUniqueId();
  const sections = () => props.sections ?? [];
  return <aside aria-label={props.brandLabel ?? "Pirate navigation"} class={cn("flex min-h-0 w-[15.5rem] shrink-0 flex-col border-e border-sidebar-border bg-sidebar p-4 text-sidebar-foreground", props.collapsed && "w-20 px-2", props.class)}>
    <button aria-label={props.homeAriaLabel ?? "Go to home"} class="mb-5 flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-start transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={props.onHomeClick} type="button"><span aria-hidden="true" class="grid size-9 shrink-0 place-items-center rounded-full border border-white/25 bg-white/10 text-sm font-semibold">P</span><Show when={!props.collapsed}><Type as="span" variant="h4" class="tracking-wide">{props.brandLabel ?? "PIRATE"}</Type></Show></button>
    <Show when={props.mediaAction && !props.collapsed}><div class="mb-4">{props.mediaAction}</div></Show>
    <nav aria-label="Main navigation" class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
      <Show when={props.primaryItems?.length}><div class="flex flex-col gap-1"><For each={props.primaryItems}>{(item) => <SidebarLink active={props.activeItemId === item.id} item={item} onNavigate={props.onNavigate} />}</For></div></Show>
      <For each={sections()}>{(section) => <section aria-labelledby={`${headingId}-${section.id}`}><Show when={!props.collapsed}><Type as="h2" variant="overline" class="px-3 pb-1 text-muted-foreground" id={`${headingId}-${section.id}`}>{section.label}</Type></Show><div class="flex flex-col gap-1"><For each={section.items}>{(item) => <SidebarLink active={props.activeItemId === item.id} item={item} onNavigate={props.onNavigate} />}</For></div><Show when={!props.collapsed && section.action}>{section.action}</Show></section>}</For>
      <Show when={props.resourceItems?.length}><section aria-labelledby={`${headingId}-resources`}><Show when={!props.collapsed}><Type as="h2" variant="overline" class="px-3 pb-1 text-muted-foreground" id={`${headingId}-resources`}>{props.resourcesLabel ?? "Resources"}</Type></Show><div class="flex flex-col gap-1"><For each={props.resourceItems}>{(item) => <SidebarLink active={props.activeItemId === item.id} item={item} onNavigate={props.onNavigate} />}</For></div></section></Show>
    </nav>
    <Show when={!props.collapsed && props.footer !== undefined}>
      <div class="mt-4 border-t border-sidebar-border pt-4">{props.footer}</div>
    </Show>
  </aside>;
}

export function SidebarContent(props: { children: JSX.Element; class?: string }) {
  return <div class={cn("min-h-screen min-w-0 flex-1 bg-background", props.class)}>{props.children}</div>;
}
