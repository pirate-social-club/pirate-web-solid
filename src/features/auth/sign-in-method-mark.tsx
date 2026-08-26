/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { IconWallet, cn } from "../../design-system";
import type { SignInMethod } from "./sign-in-model.ts";

/**
 * The leading mark on an identity-method control. Google and X have no brand
 * asset in the icon set yet, so they fall back to a lettermark in the same
 * circular frame as the icon methods; that keeps the four controls optically
 * aligned until real brand SVGs land. The mark is always decorative because
 * the control's own label names the method.
 */
const markFrameClass =
  "grid size-8 shrink-0 place-items-center rounded-full text-base font-semibold";

const letterMark = {
  google: { text: "G", class: "bg-foreground text-background" },
  twitter: { text: "\u{1D54F}", class: "bg-foreground text-background" },
  email: { text: "@", class: "border border-border text-foreground" },
} satisfies Record<Exclude<SignInMethod, "wallet">, { text: string; class: string }>;

export function SignInMethodMark(props: { method: SignInMethod }): JSX.Element {
  const mark = () => (props.method === "wallet" ? undefined : letterMark[props.method]);

  return (
    <Show
      when={mark()}
      fallback={
        <span aria-hidden="true" class={cn(markFrameClass, "border border-border text-foreground")}>
          <IconWallet class="size-5" />
        </span>
      }
    >
      {(letter) => (
        <span aria-hidden="true" class={cn(markFrameClass, letter().class)}>
          {letter().text}
        </span>
      )}
    </Show>
  );
}
