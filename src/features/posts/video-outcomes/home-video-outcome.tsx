import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { onSessionRefreshed } from "../../../api/session.ts";
import { Button } from "../../../design-system.ts";
import { useUiLocale } from "../../../lib/ui-locale.tsx";
import { getLocaleMessages } from "../../../locales/index.ts";
import type { ApplicationSessionState } from "../../shell/application-session.tsx";
import { claimVideoOutcome, type VideoOutcome } from "./claim.ts";
import { freshVideoEntryHref } from "./fresh-composer-entry.ts";

export const VIDEO_OUTCOME_TOAST_DURATION_MS = 8_000;

// Only a replay guard for this document. The server's permanent claim owns
// delivery across devices, reloads and reinstalls; nothing is persisted here.
const consumedPermissions = new Set<string>();

export function HomeVideoOutcome(props: {
  readonly session: ApplicationSessionState;
  readonly claim?: typeof claimVideoOutcome;
  readonly navigate?: (href: string) => void;
}) {
  const messages = getLocaleMessages(useUiLocale(), "feed").videoOutcome;
  const [notice, setNotice] = createSignal<{
    readonly outcome: VideoOutcome;
    readonly session: ApplicationSessionState;
    readonly generation: number;
  } | undefined>(undefined, { ownedWrite: true });
  let generation = 0;
  let abort: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const invalidate = () => {
    ++generation;
    abort?.abort();
    if (timer !== undefined) clearTimeout(timer);
    setNotice(undefined);
  };
  // The shell retains authenticated chrome while re-resolving. Invalidate at
  // the start of a refresh, before a different cookie/account can resolve.
  if (typeof window !== "undefined") onCleanup(onSessionRefreshed(invalidate));
  onCleanup(invalidate);

  createEffect(() => props.session, current => {
    invalidate();
    if (typeof window === "undefined" || typeof current !== "object" || current.status !== "authenticated") return;
    const mine = generation;
    abort = new AbortController();
    void (props.claim ?? claimVideoOutcome)({ signal: abort.signal }).then(result => {
      if (!result.display_permission) return;
      const outcome = result.outcome;
      if (consumedPermissions.has(outcome.submission_id)) return;
      // Consume before any display, even when the winning reply became stale.
      consumedPermissions.add(outcome.submission_id);
      if (mine !== generation || props.session !== current) return;
      setNotice({ outcome, session: current, generation: mine });
      timer = setTimeout(() => { if (mine === generation) setNotice(undefined); }, VIDEO_OUTCOME_TOAST_DURATION_MS);
    }, () => {});
  });

  const visible = () => {
    const current = notice();
    return current?.session === props.session && current.generation === generation ? current : undefined;
  };
  const recordAgain = () => {
    const current = visible();
    if (current === undefined || current.outcome.kind !== "processing_failure") return;
    const href = freshVideoEntryHref(current.outcome.song);
    invalidate();
    if (props.navigate !== undefined) props.navigate(href);
    else globalThis.location?.assign(href);
  };

  return <Show when={visible()}>{current => (
    <aside role="status" aria-live="polite" aria-atomic="true" data-video-outcome-toast
      class="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-[60] flex items-center gap-3 rounded-[var(--radius-xl)] border border-border-soft bg-card p-4 text-foreground shadow-[var(--shadow-lg)] md:inset-x-auto md:bottom-4 md:end-4 md:max-w-96">
      <p class="min-w-0 text-sm">{current().outcome.kind === "processing_failure" ? messages.processingFailure : messages.policyBlock}</p>
      <Show when={current().outcome.kind === "processing_failure"}>
        <Button class="shrink-0" type="button" variant="secondary" size="sm" onClick={recordAgain}>{messages.recordAgain}</Button>
      </Show>
    </aside>
  )}</Show>;
}
