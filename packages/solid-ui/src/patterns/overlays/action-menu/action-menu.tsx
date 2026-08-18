import type { JSX } from "@solidjs/web";
import { createSignal, For, Show } from "solid-js";

import { buttonVariants } from "@/components/actions/button/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/overlays/dropdown-menu/dropdown-menu";
import { cn } from "@/lib/cn";

export interface ActionMenuItem {
  key: string;
  label: string;
  /** Optional leading icon rendered before the label. */
  icon?: JSX.Element;
  destructive?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
  checked?: boolean;
}

export interface ActionMenuGroup {
  label?: string;
  items: ActionMenuItem[];
}

export interface ActionMenuProps {
  items?: ActionMenuItem[];
  groups?: ActionMenuGroup[];
  label?: string;
  triggerVariant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  /** Fully overrides the trigger content and styling (e.g. pill or icon-only
      triggers). `label` still provides the accessible name. */
  triggerContent?: JSX.Element;
  triggerClass?: string;
  contentClass?: string;
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onAction?: (key: string) => void;
  onCheckedChange?: (key: string, checked: boolean) => void;
}

function ActionMenuItems(props: { items: ActionMenuItem[]; onAction?: (key: string) => void; onCheckedChange?: (key: string, checked: boolean) => void }) {
  return (
    <For each={props.items}>
      {(item, index) => (
        <>
          <Show when={item.separatorBefore && index() > 0}>
            <DropdownMenuSeparator />
          </Show>
          <Show
            when={item.checked !== undefined}
            fallback={
              <DropdownMenuItem
                disabled={item.disabled}
                closeOnSelect
                onSelect={() => props.onAction?.(item.key)}
                class={cn(
                  item.destructive && "text-destructive-text focus:text-destructive-text",
                )}
              >
                <Show when={item.icon}>
                  {(icon) => <span aria-hidden="true" class="inline-flex shrink-0 [&_svg]:size-4">{icon()}</span>}
                </Show>
                {item.label}
              </DropdownMenuItem>
            }
          >
            <DropdownMenuCheckboxItem
              checked={item.checked}
              onChange={(checked: boolean) =>
                props.onCheckedChange?.(item.key, checked)
              }
              class={cn(
                item.destructive && "text-destructive-text focus:text-destructive-text",
              )}
            >
              {item.label}
            </DropdownMenuCheckboxItem>
          </Show>
        </>
      )}
    </For>
  );
}

export function ActionMenu(props: ActionMenuProps) {
  const [open, setOpen] = createSignal(false);
  const handleOpenChange = (next: boolean) => {
    if (props.open === undefined) setOpen(next);
    props.onOpenChange?.(next);
  };

  return (
    <DropdownMenu
      open={props.open ?? open()}
      onOpenChange={handleOpenChange}
      gutter={4}
      placement={props.placement ?? "bottom-end"}
    >
      <DropdownMenuTrigger
        aria-label={props.triggerContent !== undefined ? (props.label ?? "Open menu") : undefined}
        class={props.triggerClass ?? buttonVariants({
          variant: props.triggerVariant ?? "outline",
          size: "default",
        })}
      >
        {props.triggerContent ?? props.label ?? "Open menu"}
      </DropdownMenuTrigger>
      <DropdownMenuContent class={props.contentClass}>
        <Show
          when={props.groups && props.groups.length > 0}
          fallback={
            <ActionMenuItems
              items={props.items ?? []}
              onAction={props.onAction}
              onCheckedChange={props.onCheckedChange}
            />
          }
        >
          <For each={props.groups}>
            {(group, index) => (
              <>
                <Show when={index() > 0}>
                  <DropdownMenuSeparator />
                </Show>
                <DropdownMenuGroup>
                  <Show when={group.label}>
                    <DropdownMenuGroupLabel>{group.label}</DropdownMenuGroupLabel>
                  </Show>
                  <ActionMenuItems
                    items={group.items}
                    onAction={props.onAction}
                    onCheckedChange={props.onCheckedChange}
                  />
                </DropdownMenuGroup>
              </>
            )}
          </For>
        </Show>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
