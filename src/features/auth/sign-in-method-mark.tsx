/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { cn } from "../../design-system";
import type { SignInMethod } from "./sign-in-model.ts";

const letterMark = {
  google: "G",
  twitter: "X",
  wallet: "W",
} satisfies Record<SignInMethod, string>;

export function SignInMethodMark(props: { method: SignInMethod }): JSX.Element {
  return <span aria-hidden="true" class={cn("w-4 text-center text-sm font-semibold")}>{letterMark[props.method]}</span>;
}
