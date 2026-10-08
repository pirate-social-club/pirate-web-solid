import { omit, type ParentProps } from "solid-js";
import type { JSX } from "@solidjs/web";
import { cn } from "@/lib/cn";

export interface RewardPillProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  readonly kind: "bonus" | "lottery";
}

/** One reward treatment across video overlays and activity rows. Labels carry
 * the meaning; color supplements them. No fetching or reward policy here. */
export function RewardPill(props: ParentProps<RewardPillProps>) {
  const rest = omit(props, "kind", "class", "children");
  return <button type="button" {...rest} data-reward-kind={props.kind}
    class={cn("inline-flex min-h-9 min-w-0 cursor-pointer items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      props.kind === "lottery"
        ? "border-amber-500/50 bg-amber-950 text-amber-100 hover:bg-amber-900 light:bg-amber-100 light:text-amber-950 light:hover:bg-amber-200"
        : "border-blue-500/50 bg-blue-950 text-blue-100 hover:bg-blue-900 light:bg-blue-100 light:text-blue-950 light:hover:bg-blue-200", props.class)}>
    {props.children}
  </button>;
}
