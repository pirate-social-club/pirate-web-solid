/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";

import { cn } from "../../../design-system";
import { MobilePageHeader } from "../app-shell-chrome/app-shell-chrome";

export interface MobileRouteShellProps {
  children: JSX.Element;
  class?: string;
  footer?: JSX.Element;
  onBackClick?: () => void;
  onCloseClick?: () => void;
  title: string;
  trailingAction?: JSX.Element;
}

export function MobileRouteShell(props: MobileRouteShellProps) {
  return <div class="flex min-h-screen w-full flex-col bg-background text-foreground"><MobilePageHeader onBackClick={props.onBackClick} onCloseClick={props.onCloseClick} title={props.title} trailingAction={props.trailingAction} /><section class={cn("flex min-w-0 flex-1 flex-col px-4 pt-[calc(env(safe-area-inset-top)+5rem)]", props.class)}>{props.children}</section>{props.footer}</div>;
}
