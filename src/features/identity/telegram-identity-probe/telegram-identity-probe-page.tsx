import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Button } from "../../../design-system";
import { TELEGRAM_PROBE_CALLBACK_PATH, TELEGRAM_PROBE_PATH } from "./telegram-identity-probe-config.ts";
import { createProbeController, type ProbeView, type ProbeTabStorage, type createProbeClient } from "./telegram-identity-probe-controller.ts";

export function TelegramIdentityProbePage(props: { readonly callback?: boolean; readonly createClient?: typeof createProbeClient;
  readonly tab?: ProbeTabStorage; readonly getUrl?: () => URL; readonly navigate?: (url: string) => void }) {
  const [view, setView] = createSignal<ProbeView>({ phase: "idle" });
  let controller: ReturnType<typeof createProbeController> | undefined;
  const observation = () => { const value = view(); return "observation" in value ? value.observation : undefined; };
  const errorMessage = () => { const value = view(); return "message" in value ? value.message : ""; };
  createEffect(() => true, () => {
    const url = props.getUrl?.() ?? new URL(window.location.href);
    // Remove credentials even when storage access or callback parsing fails.
    if (props.callback) window.history.replaceState(null, "", TELEGRAM_PROBE_CALLBACK_PATH);
    try {
      controller = createProbeController({ tab: props.tab ?? window.sessionStorage, origin: url.origin,
        createClient: props.createClient, navigate: props.navigate ?? (href => window.location.assign(href)), view: setView });
      if (props.callback) void controller.resume(url);
      else controller.reset();
      const timer = window.setInterval(() => controller?.tick(), 500);
      const restored = (event: PageTransitionEvent) => {
        if (event.persisted && !props.callback) controller?.cancel("Previous login cancelled. You can start again.");
      };
      window.addEventListener("pageshow", restored);
      onCleanup(() => { window.clearInterval(timer); window.removeEventListener("pageshow", restored); });
    } catch { setView({ phase: "error", message: "This browser cannot keep temporary login state. Open the test in your browser and try again." }); }
  });
  onCleanup(() => controller?.dispose());
  return (
    <main class="mx-auto flex max-w-lg flex-col gap-4 p-6">
      <h1 class="text-xl font-semibold">Telegram login test</h1>
      <Show when={!props.callback}>
        <p>This signs in to Privy only. Your practice account and lesson stay unchanged.</p>
        <Button disabled={view().phase === "busy"} onClick={() => { void controller?.start(); }}>Sign in with Telegram</Button>
      </Show>
      <Show when={view().phase === "busy"}><Button onClick={() => controller?.cancel()}>Cancel</Button></Show>
      <div role="status" aria-live="polite">
        <Show when={view().phase === "busy"}>Completing Telegram login…</Show>
        <Show when={view().phase === "done"}>
          <p>Login returned. Server confirmation is still pending. Your practice account is not connected.</p>
          <p class="break-all text-sm">Browser observation: {observation()?.providerSubjectFingerprint}</p>
          <p class="text-sm">Started: {observation()?.startedAt}</p>
          <p class="text-sm">Returned: {observation()?.returnedAt}</p>
        </Show>
        <Show when={view().phase === "error"}>{errorMessage()}</Show>
      </div>
      <Show when={props.callback && view().phase !== "busy"}><a href={TELEGRAM_PROBE_PATH}>Open the test again</a></Show>
    </main>
  );
}
