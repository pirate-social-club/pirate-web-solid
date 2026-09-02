/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";
import { IconWallet, cn } from "../../design-system";
import type { SignInMethod } from "./sign-in-model.ts";

const letterMark = {
  google: "G",
  twitter: "X",
  wallet: "W",
} satisfies Record<SignInMethod, string>;

export function SignInMethodMark(props: { method: SignInMethod }): JSX.Element {
  return (
    <Show
      when={props.method === "wallet"}
      fallback={<span aria-hidden="true" class={cn("w-4 text-center text-sm font-semibold")}>{letterMark[props.method]}</span>}
    >
      <IconWallet aria-hidden="true" class="size-4" />
    </Show>
  );
}
