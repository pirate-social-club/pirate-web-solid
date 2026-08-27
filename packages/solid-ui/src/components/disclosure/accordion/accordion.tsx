import {
  Accordion as KAccordion,
  type AccordionContentProps as KAccordionContentProps,
  type AccordionHeaderProps as KAccordionHeaderProps,
  type AccordionItemProps as KAccordionItemProps,
  type AccordionTriggerProps as KAccordionTriggerProps,
} from "@kobalte/core/accordion";
import { createMemo, omit, type ParentProps } from "solid-js";

import { IconCaretDown } from "@/components/media/icons";
import { cn } from "@/lib/cn";

const Accordion = KAccordion;

export interface AccordionItemProps extends KAccordionItemProps {
  class?: string;
}

function AccordionItem(props: ParentProps<AccordionItemProps>) {
  const className = createMemo(() =>
    cn("border-b border-border", props.class),
  );
  const rest = omit(props, "class", "children");

  return (
    <KAccordion.Item class={className()} {...rest}>
      {props.children}
    </KAccordion.Item>
  );
}

export interface AccordionHeaderProps extends KAccordionHeaderProps {
  class?: string;
}

function AccordionHeader(props: ParentProps<AccordionHeaderProps>) {
  const className = createMemo(() => cn("flex", props.class));
  const rest = omit(props, "class", "children");

  return (
    <KAccordion.Header class={className()} {...rest}>
      {props.children}
    </KAccordion.Header>
  );
}

export interface AccordionTriggerProps extends KAccordionTriggerProps {
  class?: string;
}

function AccordionTrigger(props: ParentProps<AccordionTriggerProps>) {
  const className = createMemo(() =>
    cn(
      "group flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 py-4 text-start text-base font-medium text-foreground transition-colors motion-reduce:transition-none hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border focus-visible:ring-offset-2 ring-offset-background disabled:pointer-events-none disabled:opacity-50",
      props.class,
    ),
  );
  const rest = omit(props, "class", "children");

  return (
    <KAccordion.Trigger class={className()} {...rest}>
      {props.children}
      <IconCaretDown class="size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none group-data-[expanded]:rotate-180" />
    </KAccordion.Trigger>
  );
}

export interface AccordionContentProps extends KAccordionContentProps {
  class?: string;
}

function AccordionContent(props: ParentProps<AccordionContentProps>) {
  const className = createMemo(() => cn("text-base text-foreground", props.class));
  const rest = omit(props, "class", "children");

  return (
    <KAccordion.Content class={cn("accordion-content overflow-hidden", className())} {...rest}>
      <div class="min-w-0 pb-4 pt-0">{props.children}</div>
    </KAccordion.Content>
  );
}

export {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
};
