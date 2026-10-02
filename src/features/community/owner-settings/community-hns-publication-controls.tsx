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
    if (!wallet?.isAvailable() || blocked() || !intent || action.kind !== "publish_resource" || action.records.some((record) => !record.wallet_record)) return;
    setWalletBusy(true);
    props.onBusyChange(true);
    setUncertain(false);
    try {
      await lockPublication(intent, async () => {
        const existing = readPublication(intent);
        if (existing) { if (active) setReceipt(existing); return; }
        const current = binding();
        // Recheck after waiting for another tab, before persisting or opening Bob.
        if (!active || props.blocked || props.busy || !current || !samePublication(intent, current)) return;
        const deadline = props.snapshot.lifecycle?.deadline;
        if (deadline?.kind === "publication" && Date.parse(deadline.at) <= Date.now()) return;
        const pending: HnsPublicationReceipt = { ...intent, version: 1, txid: null };
        savePublication(pending);
        setReceipt(pending);
        let result;
        try {
          result = await wallet.publishCompleteResource(intent.root_label, action.records.flatMap((record) => record.wallet_record ? [record.wallet_record] : []));
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
          <Button loading={props.busy || walletBusy()} disabled={props.blocked} onClick={() => {
            if (!blocked()) props.onCommand({ kind: "acknowledge_complete_resource" });
          }} variant="secondary">I published all records manually</Button>
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
        <Button loading={props.busy || walletBusy()} disabled={props.blocked} onClick={reconcile} variant="secondary">Check publication status</Button>
      </Show>
      <Show when={storageFailed()}><FormNote tone="warning">Publication progress could not be saved or read. Restore browser storage, then reload to check the existing update.</FormNote></Show>
    </div>
  );
}
