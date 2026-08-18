import type { JSX } from "@solidjs/web";
import { createSignal, type Accessor } from "solid-js";

/**
 * Story render helper: keeps a controlled component's value in a signal so the
 * canvas stays interactive instead of freezing on the meta arg. The initial
 * value comes from the story args; the story forwards changes to the arg's own
 * callback so `fn()` spies still observe interactions.
 */
export function controlledRender<Args, Value>(
  initialValue: (args: Args) => Value,
  render: (
    value: Accessor<Value>,
    setValue: (next: Value) => void,
    args: Args,
  ) => JSX.Element,
) {
  return (args: Args) => {
    // Solid signal overloads exclude function values; story values are data.
    const [value, setValue] = createSignal(
      initialValue(args) as Exclude<Value, Function>,
    );
    return render(value, setValue as (next: Value) => void, args);
  };
}
