/** @jsxImportSource @solidjs/web */
import { For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";

import { IconList, Type, cn } from "../../../design-system";

export interface SidebarItem {
  id: string;
  label: string;
  icon?: JSX.Element;
  badge?: string;
}

export interface SidebarSection {
  id: string;
  label: string;
  items: readonly SidebarItem[];
  defaultOpen?: boolean;
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
  return <button aria-current={props.active ? "page" : undefined} class={cn("flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-start text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", props.active && "bg-sidebar-accent text-sidebar-accent-foreground")} onClick={() => props.onNavigate?.(props.item.id)} type="button"><Show when={props.item.icon} fallback={<IconList class="size-5" />}>{props.item.icon}</Show><span class="min-w-0 flex-1 truncate">{props.item.label}</span><Show when={props.item.badge}><span class="rounded-full bg-sidebar-primary px-1.5 text-xs text-sidebar-primary-foreground">{props.item.badge}</span></Show></button>;
}

export function AppSidebar(props: AppSidebarProps) {
  const sections = () => props.sections ?? [];
  return <aside aria-label={props.brandLabel ?? "Pirate navigation"} class={cn("flex min-h-screen w-[15.5rem] shrink-0 flex-col border-e border-sidebar-border bg-sidebar p-4 text-sidebar-foreground", props.appearance === "media" && "bg-black text-white", props.collapsed && "w-20 px-2", props.class)}>
    <button aria-label={props.homeAriaLabel ?? "Go to home"} class="mb-5 flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-start transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={props.onHomeClick} type="button"><span aria-hidden="true" class="grid size-9 shrink-0 place-items-center rounded-full border border-white/25 bg-white/10 text-sm font-semibold">P</span><Show when={!props.collapsed}><Type as="span" variant="h4" class="tracking-wide">{props.brandLabel ?? "PIRATE"}</Type></Show></button>
    <Show when={props.mediaAction && !props.collapsed}><div class="mb-4">{props.mediaAction}</div></Show>
    <nav class="flex min-h-0 flex-1 flex-col gap-5">
      <Show when={props.primaryItems?.length}><div class="flex flex-col gap-1"><For each={props.primaryItems}>{(item) => <SidebarLink active={props.activeItemId === item.id} item={item} onNavigate={props.onNavigate} />}</For></div></Show>
      <For each={sections()}>{(section) => <section aria-labelledby={`sidebar-${section.id}`}><Show when={!props.collapsed}><Type as="h2" class="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground" id={`sidebar-${section.id}`}>{section.label}</Type></Show><div class="flex flex-col gap-1"><For each={section.items}>{(item) => <SidebarLink active={props.activeItemId === item.id} item={item} onNavigate={props.onNavigate} />}</For></div></section>}</For>
      <Show when={props.resourceItems?.length}><section aria-labelledby="sidebar-resources"><Show when={!props.collapsed}><Type as="h2" class="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground" id="sidebar-resources">{props.resourcesLabel ?? "Resources"}</Type></Show><div class="flex flex-col gap-1"><For each={props.resourceItems}>{(item) => <SidebarLink active={props.activeItemId === item.id} item={item} onNavigate={props.onNavigate} />}</For></div></section></Show>
    </nav>
    <Show when={props.footer && !props.collapsed}><div class="mt-5 border-t border-sidebar-border pt-4">{props.footer}</div></Show>
  </aside>;
}

export function SidebarContent(props: { children: JSX.Element; class?: string }) {
  return <div class={cn("min-h-screen min-w-0 flex-1 bg-background", props.class)}>{props.children}</div>;
}
