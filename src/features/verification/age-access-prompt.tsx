import { Show, createSignal, onCleanup } from "solid-js";
import { Button } from "../../design-system.ts";
import { verifyAdultViewing } from "./age-verification.ts";

export interface AgeAccessPromptProps {
  readonly onVerified: (signal: AbortSignal) => void | Promise<void>;
  readonly onStart?: () => void;
  readonly onFinish?: () => void;
  readonly verify?: typeof verifyAdultViewing;
}
/** Content-free and usable inside any feed, detail, comment, or activity surface. */
export function AgeAccessPrompt(props: AgeAccessPromptProps) {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal(false);
  let operation: AbortController | undefined;
  let active = true;
  onCleanup(() => {
    active = false;
    operation?.abort();
  });
  const begin = async (button: HTMLButtonElement) => {
    if (operation !== undefined) return;
    const current = new AbortController();
    operation = current;
    setBusy(true);
    setError(false);
    try {
      props.onStart?.();
      if ((await (props.verify ?? verifyAdultViewing)(current.signal)) && !current.signal.aborted)
        await props.onVerified(current.signal);
    } catch {
      if (active && !current.signal.aborted) setError(true);
    } finally {
      props.onFinish?.();
      if (operation === current) operation = undefined;
      if (active) {
        setBusy(false);
        if (button.isConnected) button.focus({ preventScroll: true });
      }
    }
  };
  return (
    <section
      aria-label="18+ content"
      data-age-access-prompt
      class="flex flex-col items-center gap-3 rounded-xl border border-current/20 p-5 text-center"
    >
      <p>This content is available after proving you are 18 or older.</p>
      <Button
        type="button"
        variant="outline"
        disabled={busy()}
        onClick={(event) => {
          void begin(event.currentTarget);
        }}
      >
        {busy() ? "Verifying age…" : "Verify 18+ to view"}
      </Button>
      <Show when={error()}>
        <p role="alert">Age verification could not be confirmed. Please retry.</p>
      </Show>
    </section>
  );
}
