/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";

import { cn } from "../../../design-system";
import { MobilePageHeader } from "../app-shell-chrome/app-shell-chrome";

export type PageShellSize = "default" | "rail";

function PageContainer(props: { children: JSX.Element; class?: string; size?: PageShellSize }) {
  return <div class={cn("mx-auto w-full", props.size === "rail" ? "max-w-[65.5rem]" : "max-w-5xl", props.class)}>{props.children}</div>;
}

export interface StandardRoutePageProps {
  children: JSX.Element;
  class?: string;
  frameClass?: string;
  size?: PageShellSize;
  overflowHidden?: boolean;
}

export function StandardRoutePage(props: StandardRoutePageProps) {
  return <div class={cn("flex min-h-0 w-full flex-1 flex-col pt-[calc(env(safe-area-inset-top)+4.5rem)] pb-24 md:pt-6 md:pb-8", props.overflowHidden && "md:overflow-hidden", props.frameClass)}><PageContainer class={cn("flex min-h-0 flex-1 flex-col px-[var(--page-gutter-x)]", props.class)} size={props.size}>{props.children}</PageContainer></div>;
}

export interface StandaloneMobilePageProps {
  children: JSX.Element;
  class?: string;
  title: string;
  onBack?: () => void;
  onClose?: () => void;
  trailingAction?: JSX.Element;
}

export function StandaloneMobilePage(props: StandaloneMobilePageProps) {
  return <div class={cn("flex min-h-[100dvh] w-full flex-col bg-background text-foreground", props.class)}><MobilePageHeader onBackClick={props.onBack} onCloseClick={props.onClose} title={props.title} trailingAction={props.trailingAction} /><main class="flex min-w-0 flex-1 flex-col pt-[calc(env(safe-area-inset-top)+5rem)]">{props.children}</main></div>;
}

export interface PublicRoutePageProps {
  children: JSX.Element;
  class?: string;
  size?: PageShellSize;
}

export function PublicRoutePage(props: PublicRoutePageProps) {
  return <div class={cn("flex min-h-[100dvh] w-full flex-col bg-background py-4 md:py-6", props.class)}><PageContainer class="px-[var(--page-gutter-x)]" size={props.size}>{props.children}</PageContainer></div>;
}

export function FullBleedMobileListSection(props: { children: JSX.Element; class?: string }) {
  return <div class={cn("mx-[calc(var(--page-gutter-x)*-1)] md:mx-0", props.class)}>{props.children}</div>;
}
