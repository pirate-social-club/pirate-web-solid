import type { JSX } from "@solidjs/web";
import { For } from "solid-js";

import { cn } from "@/lib/cn";

export interface InputOTPProps {
  /** The controlled digit string. Non-digit characters are never rendered. */
  value?: string;
  /** Number of cells in the control. Six is the standard verification code. */
  length?: number;
  class?: string;
  disabled?: boolean;
  autofocus?: boolean;
  "aria-label"?: string;
  onChange?: (value: string) => void;
}

const digitsOnly = (value: string, length: number) =>
  value.replace(/\D/gu, "").slice(0, length);

/**
 * Controlled one-time-password input. Each cell is a real input for keyboard
 * and assistive-technology support; the component owns the small amount of
 * focus and paste behavior that makes the cells feel like one field.
 */
export function InputOTP(props: InputOTPProps): JSX.Element {
  const length = () => Math.max(1, Math.floor(props.length ?? 6));
  const label = () => props["aria-label"] ?? "Verification code";
  const inputs: HTMLInputElement[] = [];

  const slots = () => Array.from({ length: length() }, (_, index) => index);
  const slotValue = (index: number) => digitsOnly(props.value ?? "", length())[index] ?? "";

  const emitAt = (index: number, value: string) => {
    const current = digitsOnly(props.value ?? "", length()).padEnd(length(), " ").split("");
    current[index] = value.slice(-1);
    props.onChange?.(current.join("").trimEnd());
  };

  const emitFrom = (index: number, value: string) => {
    const next = digitsOnly(props.value ?? "", length()).padEnd(length(), " ").split("");
    const pasted = digitsOnly(value, length() - index);
    if (pasted.length === 0) next[index] = " ";
    pasted.split("").forEach((digit, offset) => {
      next[index + offset] = digit;
    });
    props.onChange?.(next.join("").trimEnd());
    const focusIndex = Math.min(index + Math.max(pasted.length, 1), length() - 1);
    inputs[focusIndex]?.focus();
  };

  return (
    <div
      aria-label={label()}
      class={cn("grid w-full grid-cols-6 gap-2 px-2.5", props.class)}
      data-input-otp
      role="group"
      style={{ "grid-template-columns": `repeat(${length()}, minmax(0, 1fr))` }}
    >
      <For each={slots()}>
        {(index) => (
          <input
            aria-label={`${label()} digit ${index + 1} of ${length()}`}
            autocomplete={index === 0 ? "one-time-code" : "off"}
            class="h-[58px] min-w-0 rounded-[14px] border border-border-soft bg-muted text-center text-xl font-medium text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-2 focus:border-primary focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={props.disabled}
            inputmode="numeric"
            maxlength="1"
            onInput={(event) => emitFrom(index, event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Backspace" && slotValue(index) === "" && index > 0) {
                event.preventDefault();
                emitAt(index - 1, "");
                inputs[index - 1]?.focus();
              } else if (event.key === "ArrowLeft" && index > 0) {
                event.preventDefault();
                inputs[index - 1]?.focus();
              } else if (event.key === "ArrowRight" && index < length() - 1) {
                event.preventDefault();
                inputs[index + 1]?.focus();
              }
            }}
            onPaste={(event) => {
              event.preventDefault();
              emitFrom(index, event.clipboardData?.getData("text") ?? "");
            }}
            pattern="[0-9]*"
            ref={(element) => {
              inputs[index] = element;
              if (props.autofocus && index === 0) {
                element.focus();
                globalThis.setTimeout(() => element.focus(), 0);
              }
            }}
            type="text"
            value={slotValue(index)}
          />
        )}
      </For>
    </div>
  );
}
