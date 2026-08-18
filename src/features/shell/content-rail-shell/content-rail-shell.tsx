/** @jsxImportSource @solidjs/web */
import { Show } from "solid-js";
import type { JSX } from "@solidjs/web";

import { cn } from "../../../design-system";

export interface ContentRailShellProps {
  children: JSX.Element;
  class?: string;
  contentClass?: string;
  header?: JSX.Element;
  rail?: JSX.Element;
  railClass?: string;
  reserveRail?: boolean;
}

export function ContentRailShell(props: ContentRailShellProps) {
  return <section class={cn("mx-auto flex w-full min-w-0 max-w-[65.5rem] flex-col gap-5", props.class)}>
    <Show when={props.header}><div class="min-w-0">{props.header}</div></Show>
    <div class="flex min-w-0 flex-col gap-6 xl:flex-row xl:items-start">
      <div class={cn("min-w-0 xl:flex-1", props.contentClass)}>{props.children}</div>
      <Show when={props.reserveRail || props.rail}><div class="min-w-0 xl:w-72 xl:shrink-0"><Show when={props.rail}><aside class={cn("hidden xl:block", props.railClass)}>{props.rail}</aside></Show></div></Show>
    </div>
  </section>;
}
