import { For, Show } from "solid-js";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, IconDotsThree } from "../../../design-system.ts";

export interface ContentAction {
  readonly label: string;
  readonly disabled?: boolean;
  readonly run: () => void;
}

/** Controllers supply permitted actions; no handler means no menu. */
export function ContentOverflowMenu(props: { label: string; actions?: readonly ContentAction[] }) {
  return <Show when={props.actions?.length}><DropdownMenu forceMount placement="bottom-end">
    <DropdownMenuTrigger aria-label={props.label} class="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><IconDotsThree class="size-6" aria-hidden="true" /></DropdownMenuTrigger>
    <DropdownMenuContent class="data-[closed]:hidden"><For each={props.actions}>{action => <DropdownMenuItem as="button" disabled={action.disabled} onClick={action.run}>{action.label}</DropdownMenuItem>}</For></DropdownMenuContent>
  </DropdownMenu></Show>;
}
