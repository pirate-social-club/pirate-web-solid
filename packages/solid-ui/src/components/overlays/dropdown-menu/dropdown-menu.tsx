import { DropdownMenu as KMenu } from "@kobalte/core/dropdown-menu";
import { createMemo, omit, type ParentProps } from "solid-js";

import { IconCheck } from "@/components/media/icons";
import { cn } from "@/lib/cn";

const DropdownMenu = KMenu;
const DropdownMenuTrigger = KMenu.Trigger;
const DropdownMenuGroup = KMenu.Group;
const DropdownMenuRadioGroup = KMenu.RadioGroup;

const itemClasses =
  "relative flex w-full cursor-pointer select-none items-center rounded-none py-2.5 pe-8 ps-3 text-start text-base text-popover-foreground outline-none transition-colors hover:text-foreground focus:bg-muted focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted";

function DropdownMenuContent(
  props: ParentProps<Parameters<typeof KMenu.Content>[0]>,
) {
  const className = createMemo(() =>
    cn(
      "relative z-50 max-h-96 min-w-32 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-popover p-0 text-popover-foreground shadow-md",
      props.class,
    ),
  );
  const rest = omit(props, "class", "children");

  return (
    <KMenu.Portal>
      <KMenu.Content class={className()} {...rest}>
        {props.children}
      </KMenu.Content>
    </KMenu.Portal>
  );
}

function DropdownMenuItem(
  props: ParentProps<Parameters<typeof KMenu.Item>[0]>,
) {
  const className = createMemo(() => cn(itemClasses, props.class));
  const rest = omit(props, "class", "children");

  return (
    <KMenu.Item class={className()} {...rest}>
      {props.children}
    </KMenu.Item>
  );
}

function DropdownMenuCheckboxItem(
  props: ParentProps<Parameters<typeof KMenu.CheckboxItem>[0]>,
) {
  const className = createMemo(() => cn(itemClasses, props.class));
  const rest = omit(props, "class", "children");

  return (
    <KMenu.CheckboxItem class={className()} {...rest}>
      <KMenu.ItemIndicator class="absolute end-2 inline-flex size-4 items-center justify-center">
        <IconCheck class="size-3.5" />
      </KMenu.ItemIndicator>
      {props.children}
    </KMenu.CheckboxItem>
  );
}

function DropdownMenuRadioItem(
  props: ParentProps<Parameters<typeof KMenu.RadioItem>[0]>,
) {
  const className = createMemo(() => cn(itemClasses, props.class));
  const rest = omit(props, "class", "children");

  return (
    <KMenu.RadioItem class={className()} {...rest}>
      <KMenu.ItemIndicator class="absolute end-2 inline-flex size-4 items-center justify-center">
        <IconCheck class="size-3.5" />
      </KMenu.ItemIndicator>
      {props.children}
    </KMenu.RadioItem>
  );
}

function DropdownMenuGroupLabel(
  props: ParentProps<Parameters<typeof KMenu.GroupLabel>[0]>,
) {
  const className = createMemo(() =>
    cn("px-3 py-2 text-base font-semibold text-muted-foreground", props.class),
  );
  const rest = omit(props, "class", "children");

  return (
    <KMenu.GroupLabel class={className()} {...rest}>
      {props.children}
    </KMenu.GroupLabel>
  );
}

function DropdownMenuSeparator(
  props: Parameters<typeof KMenu.Separator>[0],
) {
  const className = createMemo(() => cn("my-1 h-px bg-border", props.class));

  return <KMenu.Separator class={className()} {...omit(props, "class")} />;
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
