import { Dynamic, type JSX } from "@solidjs/web";
import { children as resolveChildren, createMemo, omit, type ParentProps } from "solid-js";

import { typeVariants } from "@/components/data-display/type/type";
import { cn } from "@/lib/cn";

function Card(props: ParentProps<JSX.HTMLAttributes<HTMLDivElement> & { class?: string }>) {
  const content = resolveChildren(() => props.children);
  const className = createMemo(() =>
    cn(
      "rounded-[var(--radius-lg)] border border-border-soft bg-card text-card-foreground shadow-[var(--shadow-md)]",
      props.class,
    ),
  );
  const rest = omit(props, "class", "children");

  return (
    <div class={className()} {...rest}>
      {content()}
    </div>
  );
}

function CardHeader(props: ParentProps<JSX.HTMLAttributes<HTMLDivElement> & { class?: string }>) {
  const content = resolveChildren(() => props.children);
  const className = createMemo(() =>
    cn("flex flex-col space-y-1.5 p-6", props.class),
  );
  const rest = omit(props, "class", "children");

  return (
    <div class={className()} {...rest}>
      {content()}
    </div>
  );
}

/**
 * CardTitle - the card's heading. It renders h3 by default, which is right for
 * a card nested under a section heading but skips a level on a page whose only
 * ancestor heading is the h1. axe reports that as heading-order, so `as` lets
 * the host place the card correctly in the document outline. The visual size
 * is fixed regardless of level; only the semantics change.
 */
function CardTitle(
  props: ParentProps<
    JSX.HTMLAttributes<HTMLHeadingElement> & {
      class?: string;
      as?: "h2" | "h3" | "h4" | "h5" | "h6";
    }
  >,
) {
  const content = resolveChildren(() => props.children);
  const className = createMemo(() =>
    cn(typeVariants({ variant: "h3" }), "text-balance", props.class),
  );
  const rest = omit(props, "class", "children", "as");

  return (
    <Dynamic component={props.as ?? "h3"} class={className()} {...rest}>
      {content()}
    </Dynamic>
  );
}

function CardDescription(
  props: ParentProps<JSX.HTMLAttributes<HTMLParagraphElement> & { class?: string }>,
) {
  const content = resolveChildren(() => props.children);
  const className = createMemo(() =>
    cn(typeVariants({ variant: "caption" }), props.class),
  );
  const rest = omit(props, "class", "children");

  return (
    <p class={className()} {...rest}>
      {content()}
    </p>
  );
}

function CardContent(props: ParentProps<JSX.HTMLAttributes<HTMLDivElement> & { class?: string }>) {
  const content = resolveChildren(() => props.children);
  const className = createMemo(() => cn("p-6 pt-0", props.class));
  const rest = omit(props, "class", "children");

  return (
    <div class={className()} {...rest}>
      {content()}
    </div>
  );
}

function CardFooter(props: ParentProps<JSX.HTMLAttributes<HTMLDivElement> & { class?: string }>) {
  const content = resolveChildren(() => props.children);
  const className = createMemo(() => cn("flex items-center p-6 pt-0", props.class));
  const rest = omit(props, "class", "children");

  return (
    <div class={className()} {...rest}>
      {content()}
    </div>
  );
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
