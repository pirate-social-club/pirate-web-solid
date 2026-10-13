import { Show, createSignal, onCleanup } from "solid-js";
import { Button } from "../../design-system";
import { usePageUiLocale } from "../../lib/ui-locale";
import { getLocaleMessages, interpolateMessage } from "../../locales";
import { createGuestStudyDataController, type GuestDataApi, type GuestDataState } from "./guest-study-data-controller";

interface GuestStudyDataControlsProps {
  readonly api: GuestDataApi;
  readonly ownerId: string;
  readonly credentialId: string;
}

export function GuestStudyDataControls(props: GuestStudyDataControlsProps) {
  return <Show when={props.ownerId} keyed>{ownerId =>
    <GuestStudyOwnerDataControls api={props.api} ownerId={ownerId} credentialId={props.credentialId} />
  }</Show>;
}

function GuestStudyOwnerDataControls(props: GuestStudyDataControlsProps) {
  const locale = usePageUiLocale();
  const text = () => getLocaleMessages(locale, "routes").guestStudyData;
  const [state, setState] = createSignal<GuestDataState>({ retention: null, retentionStatus: "unknown",
    requestedMode: null, deletion: null, deletionStatus: "idle" });
  const controller = createGuestStudyDataController({ api: props.api,
    scope: () => ({ ownerId: props.ownerId, credentialId: props.credentialId }),
    key: () => `guest-data:${crypto.randomUUID()}`, changed: setState });
  onCleanup(() => controller.dispose());
  const retentionBusy = () => state().retentionStatus === "saving";
  const unresolved = () => state().requestedMode !== null;
  return <section class="flex flex-col gap-3" aria-label={text().heading}>
    <h2 class="font-semibold">{text().heading}</h2>
    <p>{text().intro}</p>
    <p role="status" aria-live="polite">{state().retention ? interpolateMessage(text().retentionConfirmed, {
      mode: state().retention?.mode === "ephemeral" ? text().ephemeral : text().privateLearning,
      time: state().retention?.effective_at ?? "",
    }) : text().retentionUnknown}</p>
    <div class="flex flex-wrap gap-3">
      <Button disabled={retentionBusy() || unresolved()} onClick={() => void controller.setRetention("ephemeral")}>{text().ephemeralAction}</Button>
      <Button disabled={retentionBusy() || unresolved()} onClick={() => void controller.setRetention("private_learning")}>{text().privateAction}</Button>
    </div>
    <Show when={state().retentionStatus === "uncertain"}>
      <p>{text().retentionUncertain}</p>
      <Button onClick={() => { const mode = state().requestedMode; if (mode) void controller.setRetention(mode); }}>{text().retry}</Button>
    </Show>
    <Button disabled={state().deletionStatus === "deleting"} onClick={() => void controller.deleteAudio()}>
      {state().deletionStatus === "pending" || state().deletionStatus === "uncertain" ? text().retryDeletion : text().deleteAction}
    </Button>
    <p role="status" aria-live="polite">{text().deletionStatuses[state().deletionStatus]}</p>
    <Show when={state().deletion}>
      <p>{interpolateMessage(text().counts, { deleted: state().deletion?.deleted_count ?? 0, remaining: state().deletion?.remaining_count ?? 0 })}</p>
      <p>{text().providerStates[state().deletion?.provider_disposition ?? "unknown"]}</p>
    </Show>
  </section>;
}
