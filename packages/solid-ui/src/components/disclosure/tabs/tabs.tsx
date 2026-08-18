import {
  Tabs as KTabs,
  type TabsContentProps as KTabsContentProps,
  type TabsListProps as KTabsListProps,
  type TabsTriggerProps as KTabsTriggerProps,
} from "@kobalte/core/tabs";
import {
  createMemo,
  omit,
  type ParentProps,
} from "solid-js";

import { typeVariants } from "@/components/data-display/type/type";
import { cn } from "@/lib/cn";

const Tabs = KTabs;

export interface TabsContentProps extends KTabsContentProps {
  class?: string;
}

export type TabsVisualVariant = "pill" | "underline";

export interface TabsListProps extends Omit<KTabsListProps, "class"> {
  class?: string;
  columns?: number;
  variant?: TabsVisualVariant;
}

function TabsList(props: ParentProps<TabsListProps>) {
  const className = createMemo(() =>
    cn(
      props.variant === "underline"
        ? "h-auto w-full rounded-none border-b border-border-soft bg-transparent p-0 text-muted-foreground"
        : "inline-flex h-11 items-center justify-center gap-1 rounded-full bg-muted p-1 text-muted-foreground",
      props.variant === "underline" && (props.columns ? "grid gap-0 overflow-visible" : "overflow-x-auto"),
      props.class,
    ),
  );
  const rest = omit(props, "class", "children", "columns", "variant");
  const style = () =>
    props.variant === "underline" && props.columns
      ? `grid-template-columns: repeat(${props.columns}, minmax(0, 1fr))`
      : undefined;

  return <KTabs.List class={className()} style={style()} {...rest}>{props.children}</KTabs.List>;
}

export interface TabsTriggerProps extends Omit<KTabsTriggerProps, "class"> {
  class?: string;
  variant?: TabsVisualVariant;
}

function TabsTrigger(props: ParentProps<TabsTriggerProps>) {
  const className = createMemo(() =>
    cn(
      "inline-flex cursor-pointer items-center justify-center whitespace-nowrap transition-all motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:pointer-events-none disabled:opacity-50",
      typeVariants({ variant: props.variant === "underline" ? "body-strong" : "label" }),
      "text-muted-foreground",
      props.variant === "underline"
        ? "min-w-0 rounded-none border-b-2 border-transparent px-1 py-4 data-[selected]:border-primary data-[selected]:bg-transparent data-[selected]:shadow-none"
        : "rounded-full px-4 py-2 data-[selected]:bg-card data-[selected]:text-foreground data-[selected]:shadow-sm",
      props.class,
    ),
  );
  const rest = omit(props, "class", "children", "variant");

  return <KTabs.Trigger class={className()} {...rest}>{props.children}</KTabs.Trigger>;
}

function TabsContent(props: ParentProps<TabsContentProps>) {
  const className = createMemo(() =>
    cn(
      "mt-4 min-h-12 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      props.class,
    ),
  );
  const rest = omit(props, "class", "children");

  return (
    <KTabs.Content class={className()} {...rest}>
      {props.children}
    </KTabs.Content>
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
