// The identity and visibility pills are one control family: identical height,
// border, background, hover, and type wherever they render.
import { cn, pillButtonVariants } from "../../../design-system";

export const composerPillTriggerClass = cn(
  pillButtonVariants({ tone: "default" }),
  "h-11 min-w-0 gap-2 text-foreground",
);

export const composerRowTriggerClass =
  "flex h-8 w-max min-w-0 items-center gap-2 px-0 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring";
