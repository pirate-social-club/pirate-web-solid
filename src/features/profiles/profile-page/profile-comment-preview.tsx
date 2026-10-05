import { Show } from "solid-js";
import { Type } from "../../../design-system.ts";

/** Explicit Storybook comment presentation; the live post renderer stays independent. */
export function CommentContent(props: { authorLabel: string; metadata?: string; body?: string }) {
  return <div class="flex flex-col gap-2">
    <div class="flex flex-wrap items-center justify-between gap-2"><Type variant="label">{props.authorLabel}</Type><Show when={props.metadata}>{metadata => <Type variant="caption">{metadata()}</Type>}</Show></div>
    <Show when={props.body !== undefined}><Type variant="body">{props.body}</Type></Show>
  </div>;
}
