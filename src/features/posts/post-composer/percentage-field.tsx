import { Input, cn } from "../../../design-system";

/** A visibly editable percentage field shared by royalty allocation controls. */
export function PostComposerPercentageField(props: {
  "aria-label": string;
  class?: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <div
      class={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center rounded-lg border border-input bg-background px-2 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/35",
        props.class,
      )}
    >
      <Input
        aria-label={props["aria-label"]}
        class="h-10 min-w-0 rounded-none border-0 bg-transparent px-0 text-end text-sm font-semibold shadow-none focus-visible:ring-0"
        inputmode="numeric"
        max="100"
        min="0"
        onChange={(event) => props.onChange(Math.min(100, Math.max(0, Number(event.currentTarget.value) || 0)))}
        step="1"
        type="number"
        value={props.value}
      />
      <span aria-hidden="true" class="ps-0.5 text-sm font-semibold">%</span>
    </div>
  );
}
