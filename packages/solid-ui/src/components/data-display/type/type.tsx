import { Dynamic, type JSX } from "@solidjs/web";
import { createMemo, omit, type ParentProps } from "solid-js";

import { cn } from "@/lib/cn";
import { cva, type VariantProps } from "@/lib/recipe";

export const typeVariants = cva("", {
  variants: {
    variant: {
      display: "text-4xl font-bold tracking-tight text-foreground md:text-5xl",
      h1: "text-3xl font-semibold tracking-tight text-foreground",
      h2: "text-2xl font-semibold tracking-tight text-foreground",
      h3: "text-xl font-semibold tracking-tight text-foreground",
      h4: "text-lg font-semibold tracking-tight text-foreground",
      body: "text-base font-normal leading-6 text-foreground",
      "body-strong": "text-base font-semibold leading-6 text-foreground",
      label: "text-base font-medium leading-tight text-foreground",
      caption: "text-base font-normal leading-5 text-muted-foreground",
      overline:
        "text-base font-medium uppercase tracking-[0.03em] text-muted-foreground",
    },
    leading: {
      roomy: "leading-8",
      tight: "leading-tight",
    },
    responsiveSize: {
      desktop4xl: "md:text-4xl",
    },
  },
  defaultVariants: {
    variant: "body",
  },
});

export interface TypeProps
  extends Omit<JSX.HTMLAttributes<HTMLElement>, "class" | "ref">,
    VariantProps<typeof typeVariants> {
  class?: string;
  as?: keyof JSX.HTMLElementTags;
}

export function Type(props: ParentProps<TypeProps>) {
  const className = createMemo(() =>
    cn(
      typeVariants({
        leading: props.leading,
        responsiveSize: props.responsiveSize,
        variant: props.variant,
      }),
      props.class,
    ),
  );
  const rest = omit(
    props,
    "class",
    "leading",
    "responsiveSize",
    "variant",
    "as",
    "children",
  );

  return (
    <Dynamic component={props.as ?? "span"} class={className()} {...rest}>
      {props.children}
    </Dynamic>
  );
}
