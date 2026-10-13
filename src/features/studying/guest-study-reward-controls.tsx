import { OwnerStudyRecoveryControls } from "./owner-study-recovery-controls";
import { For, Show, createSignal, onCleanup, untrack } from "solid-js";
import { Button } from "../../design-system";
import { usePageUiLocale } from "../../lib/ui-locale";
import { getLocaleMessages, interpolateMessage } from "../../locales";
import { requestGlobalSignInCompletion } from "../auth/global-sign-in-host";
import type { GuestStudyApi, GuestStudySession } from "./guest-study-api";
import { createGuestStudyAccountingApi, type GuestStudyAccountingApi } from "./guest-study-accounting-api";
import { createGuestStudyAttachmentCoordinator, type GuestAttachmentState } from "./guest-study-attachment-coordinator";
import { guestParticipationStatus, guestPurchaseStatus, type GuestParticipationProjection } from "./guest-study-reward-model";

interface Props { api: Pick<GuestStudyApi, "listParticipations" | "createAttachmentIntent">; session: GuestStudySession; credentialId: () => string | null; accounting?: GuestStudyAccountingApi }
export function GuestStudyRewardControls(props: Props) {
  return <Show when={props.session.owner_id} keyed>{ownerId => <OwnerRewardControls {...props} ownerId={ownerId} />}</Show>;
}
function OwnerRewardControls(props: Props & { ownerId: string }) {
  const copy = getLocaleMessages(usePageUiLocale(), "routes").guestStudyRewards;
  const [items, setItems] = createSignal<GuestParticipationProjection[]>([]);
  const [cursor, setCursor] = createSignal<string | null>(null);
  const [readState, setReadState] = createSignal<"idle" | "reading" | "known" | "unknown">("idle");
  const [attachmentState, setAttachmentState] = createSignal<GuestAttachmentState>();
  const [busy, setBusy] = createSignal(false);
  let active = true, readController: AbortController | undefined, actionController: AbortController | undefined;
  const accounting = untrack(() => props.accounting);
  let attachment: ReturnType<typeof createGuestStudyAttachmentCoordinator> | undefined;
  const ceremony = () => attachment ??= createGuestStudyAttachmentCoordinator({ origin: window.location.origin, ownerId: props.ownerId,
    credentialId: props.credentialId, guest: props.api, accounting: accounting ?? createGuestStudyAccountingApi({ origin: window.location.origin }) });
  onCleanup(() => { active = false; readController?.abort(); actionController?.abort(); });
  const read = async (append: boolean) => {
    if (!active || readState() === "reading") return;
    const credential = props.credentialId(); if (credential === null) { setReadState("unknown"); return; }
    const pageCursor = append ? cursor() : null;
    readController?.abort(); const controller = new AbortController(); readController = controller;
    setReadState("reading"); const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const interrupted = new Promise<never>((_resolve, reject) => {
        const refused = () => reject(new Error("Participation read unresolved"));
        controller.signal.addEventListener("abort", refused, { once: true });
        if (controller.signal.aborted) refused();
      });
      const page = await Promise.race([props.api.listParticipations({ headers: { "x-guest-credential-id": credential }, query: { limit: "100", ...(pageCursor === null ? {} : { cursor: pageCursor }) } }, controller.signal), interrupted]);
      if (!active || controller.signal.aborted) return;
      const previous = append ? items() : [];
      // Projection identities are immutable; refreshed pages replace the same ID, never mint shares.
      const known = new Map(previous.map(item => [item.participation_id, item]));
      for (const item of page.items) known.set(item.participation_id, item);
      setItems([...known.values()]); setCursor(page.next_cursor); setReadState("known");
    } catch { if (active) setReadState("unknown"); }
    finally { clearTimeout(timer); if (active && readState() === "reading") setReadState("unknown"); }
  };
  const connect = async () => {
    if (!active || busy()) return;
    setBusy(true); actionController?.abort(); const controller = new AbortController(); actionController = controller;
    const timer = setTimeout(() => controller.abort(), 600_000);
    try {
      const start = await ceremony().begin(controller.signal);
      if (!active || controller.signal.aborted) return;
      setAttachmentState(start);
      if (start.status === "bound" || start.status === "unavailable") return;
      if (!await requestGlobalSignInCompletion(controller.signal)) return;
      const prepared = await ceremony().prepare(controller.signal);
      if (active && !controller.signal.aborted) setAttachmentState(prepared);
    } catch { if (active) setAttachmentState({ status: "pending" }); }
    finally { clearTimeout(timer); if (active) setBusy(false); }
  };
  const confirm = async () => {
    const current = attachmentState();
    if (!active || busy() || current?.status !== "awaiting_confirmation") return;
    setBusy(true); const controller = new AbortController(); actionController = controller;
    try { const result = await ceremony().confirm(current.target, controller.signal); if (active) setAttachmentState(result); }
    catch { if (active) setAttachmentState({ status: "pending" }); }
    finally { if (active) setBusy(false); }
  };
  const target = () => { const value = attachmentState(); return value?.status === "awaiting_confirmation" ? value.target : undefined; };
  const bound = () => { const value = attachmentState(); return value?.status === "bound" ? value.binding : undefined; };
  return <Show when={bound()} fallback={(<section class="flex flex-col gap-3 p-5" data-guest-reward-status aria-label={copy.heading}>
    <h2 class="font-semibold">{copy.heading}</h2>
    <Show when={props.session.status === "completed"}><p>{copy.lessonComplete}</p></Show>
    <p role="status">{copy.statuses[guestParticipationStatus(props.session.participation)]}</p>
    <Show when={props.session.reward_terms}>{terms => <p>{interpolateMessage(copy.originalDrawing, { drawing: terms().original_drawing_id })}</p>}</Show>
    <Button disabled={readState() === "reading"} onClick={() => void read(false)}>{copy.refresh}</Button>
    <Show when={readState() === "unknown"}><p role="status">{copy.unknown}</p></Show>
    <For each={items()}>{item => <div><p>{interpolateMessage(copy.originalDrawing, { drawing: item.original_drawing_id })}</p><p>{copy.statuses[guestPurchaseStatus(item)]}</p></div>}</For>
    <Show when={cursor() !== null}><Button disabled={readState() === "reading"} onClick={() => void read(true)}>{copy.loadMore}</Button></Show>
    <p>{copy.heldOwed}</p>
    <Show when={attachmentState()?.status !== "bound"} fallback={<p role="status">{copy.bound}</p>}>
      <Button disabled={busy()} onClick={() => void connect()}>{attachmentState() === undefined ? copy.signup : copy.resumeAttachment}</Button>
      <Show when={target()}>{current => <><p>{interpolateMessage(copy.accountTarget, { name: current().account_confirmation.display_name ?? current().account_confirmation.account_id, account: current().account_confirmation.account_id })}</p>
        <Button disabled={busy()} onClick={() => void confirm()}>{interpolateMessage(copy.confirmTarget, { account: current().account_confirmation.account_id })}</Button></>}</Show>
      <Show when={attachmentState()?.status === "pending"}><p role="status">{copy.attachmentPending}</p></Show>
      <Show when={attachmentState()?.status === "unavailable"}><p role="status">{copy.attachmentUnavailable}</p></Show>
    </Show>
  </section>)}>{binding => <OwnerStudyRecoveryControls originalAccountId={binding().account_id} accounting={accounting} />}</Show>;
}
