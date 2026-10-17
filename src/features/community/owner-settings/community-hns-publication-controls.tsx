import { Button, FormNote } from "@pirate/web-solid-ui";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import type { CommunityHnsWallet } from "./community-hns-wallet";
import { lockPublication, publicationBinding, readPublication, samePublication, savePublication, type HnsPublicationBinding, type HnsPublicationReceipt } from "./community-hns-publication";
import type { NamespaceSettingsCommandInput, NamespaceSettingsSnapshot } from "./owner-settings-model";

export function CommunityHnsPublicationControls(props: {
  snapshot: NamespaceSettingsSnapshot;
  wallet?: CommunityHnsWallet;
  busy?: boolean;
  blocked: boolean;
  onBusyChange: (busy: boolean) => void;
  onCommand: (command: NamespaceSettingsCommandInput) => void;
}) {
  const [receipt, setReceipt] = createSignal<HnsPublicationReceipt | null>(null);
  const [storageFailed, setStorageFailed] = createSignal(false);
  const [walletBusy, setWalletBusy] = createSignal(false);
  const [uncertain, setUncertain] = createSignal(false);
  const [connectionFailed, setConnectionFailed] = createSignal(false);
  let active = true;
  const binding = () => publicationBinding(props.snapshot);
  const refresh = (current: HnsPublicationBinding | null) => {
    try {
      setReceipt(current ? readPublication(current) : null);
      setStorageFailed(false);
    } catch {
      // Corrupt or inaccessible storage is not evidence that no send happened.
      setStorageFailed(true);
    }
  };
  let refreshGeneration = 0;
  createEffect(binding, (current) => {
    const generation = ++refreshGeneration;
    queueMicrotask(() => { if (active && generation === refreshGeneration) refresh(current); });
  });
  const changed = () => refresh(binding());
  const browser = globalThis.window;
  browser?.addEventListener("storage", changed);
  onCleanup(() => {
    active = false;
    browser?.removeEventListener("storage", changed);
  });
  const blocked = () => {
    const deadline = props.snapshot.lifecycle?.deadline;
    return props.blocked || props.busy || walletBusy()
      || (deadline?.kind === "publication" && Date.parse(deadline.at) <= Date.now());
  };
  const planChanged = () => {
    const saved = receipt();
    const current = binding();
    return saved !== null && current !== null && !samePublication(saved, current);
  };
  const reconcile = () => {
    if (blocked()) return;
    const current = binding();
    const saved = receipt();
    props.onCommand(current && saved && samePublication(current, saved) && !storageFailed()
      ? { kind: "acknowledge_complete_resource", publication: saved }
      : { kind: "poll" });
  };
  const publish = async () => {
    const intent = binding();
    const action = props.snapshot.next_action;
    const wallet = props.wallet;
    if (!wallet || blocked() || !intent || action.kind !== "publish_resource" || action.records.some((record) => !record.wallet_record)) return;
    setWalletBusy(true);
    props.onBusyChange(true);
    setUncertain(false);
    setConnectionFailed(false);
    try {
      await lockPublication(intent, async () => {
        const existing = readPublication(intent);
        if (existing) { if (active) setReceipt(existing); return; }
        const stillCurrent = () => {
          const current = binding();
          const deadline = props.snapshot.lifecycle?.deadline;
          return active && !props.blocked && !props.busy && current && samePublication(intent, current)
            && !(deadline?.kind === "publication" && Date.parse(deadline.at) <= Date.now());
        };
        // A rejected connection cannot have sent this UPDATE. Persist only after
        // connecting, then recheck the session/deadline before the send boundary.
        if (!stillCurrent()) return;
        let connected;
        try { connected = await wallet.connectForPublication(); }
        catch { if (active) setConnectionFailed(true); return; }
        if (!stillCurrent()) return;
        const pending: HnsPublicationReceipt = { ...intent, version: 1, txid: null };
        savePublication(pending);
        setReceipt(pending);
        let result;
        try {
          result = await connected.publishCompleteResource(intent.root_label, action.records.flatMap((record) => record.wallet_record ? [record.wallet_record] : []));
        } catch {
          if (active) setUncertain(true);
          return;
        }
        const completed: HnsPublicationReceipt = { ...pending, txid: result.txid };
        // Retain the result in memory even if the second write fails. The
        // already-durable intent still prevents replay after a reload.
        if (active) setReceipt(completed);
        savePublication(completed);
        const latest = binding();
        if (!active || props.blocked || !latest || !samePublication(intent, latest)) return;
        if (result.txid === null) { setUncertain(true); return; }
        props.onCommand({ kind: "acknowledge_complete_resource", publication: completed });
      });
    } catch {
      if (active) setStorageFailed(true);
    } finally {
      if (active) {
        setWalletBusy(false);
      }
      props.onBusyChange(false);
    }
  };
  return (
    <div class="space-y-3">
      <Show when={receipt() || storageFailed()} fallback={(
        <div class="flex flex-wrap gap-3">
          <Show when={props.wallet?.isAvailable() && props.snapshot.next_action.kind === "publish_resource"
            && props.snapshot.next_action.records.every((record) => record.wallet_record)}>
            <Button loading={props.busy || walletBusy()} disabled={props.blocked || binding() === null} onClick={() => void publish()}>
              Publish to {props.snapshot.root_label}/ with Bob Wallet
            </Button>
            <Show when={binding() === null}><FormNote>Refresh the import status before publishing with Bob.</FormNote></Show>
          </Show>
        </div>
      )}>
        <FormNote>{receipt() ? "A wallet publication was started. Check its status before taking another action." : "Publication status needs to be checked before continuing."}</FormNote>
        <Show when={receipt()?.txid}>{(txid) => <FormNote>Transaction <code class="break-all select-all">{txid()}</code></FormNote>}</Show>
        <Show when={!walletBusy() && (uncertain() || (receipt() !== null && receipt()?.txid === null))}>
          <FormNote tone="warning">Bob's completion could not be confirmed. Check the publication; do not send another wallet update.</FormNote>
        </Show>
        <Show when={planChanged()}>
          <FormNote tone="warning">The record plan has changed. Refresh the import status to resolve the earlier wallet update.</FormNote>
        </Show>
      </Show>
      <div class="flex flex-wrap gap-3">
        <Show when={receipt() || storageFailed()}>
          <Button loading={props.busy || walletBusy()} disabled={props.blocked} onClick={reconcile} variant="secondary">Check publication status</Button>
        </Show>
        <Button loading={props.busy || walletBusy()} disabled={props.blocked || planChanged()} onClick={() => {
          if (blocked() || planChanged()) return;
          const saved = receipt();
          props.onCommand(saved
            ? { kind: "acknowledge_complete_resource", publication: saved }
            : { kind: "acknowledge_complete_resource" });
        }} variant="secondary">I published all records manually</Button>
      </div>
      <Show when={connectionFailed() && !receipt() && !storageFailed()}><FormNote tone="warning">Could not connect to Bob. No update was sent. Unlock or reconnect your wallet, then try again.</FormNote></Show>
      <Show when={storageFailed()}><FormNote tone="warning">Automatic publication is unavailable because browser storage or locking could not be used. You can acknowledge records already published manually.</FormNote></Show>
    </div>
  );
}
