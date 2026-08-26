import { For, Show } from "solid-js";

import { Button, Input, RadioIndicator, Type } from "../../../design-system";
import type { AssetLicensePresetId, AssetRoyaltyAllocation, AssetRoyaltySplitState } from "../post-composer/types";
import { basisPointsToPercentText, percentTextToBasisPoints } from "./contracts";

const presets: readonly { readonly id: AssetLicensePresetId; readonly label: string }[] = [
  { id: "non-commercial", label: "Non-commercial remixing" },
  { id: "commercial-use", label: "Commercial use" },
  { id: "commercial-remix", label: "Commercial remix" },
];

function allocationBps(allocation: AssetRoyaltyAllocation): number {
  return allocation.shareBps ?? Math.round(allocation.sharePct * 100);
}

export function SongTermsEditor(props: {
  readonly license: AssetLicensePresetId;
  readonly commercialRevShareBps: number;
  readonly allocations: AssetRoyaltySplitState;
  readonly onLicenseChange: (license: AssetLicensePresetId) => void;
  readonly onCommercialRevShareBpsChange: (value: number) => void;
  readonly onAllocationsChange: (value: AssetRoyaltySplitState) => void;
}) {
  const total = () => props.allocations.allocations.reduce((sum, allocation) => sum + allocationBps(allocation), 0);
  const update = (id: string, patch: Partial<AssetRoyaltyAllocation>) => props.onAllocationsChange({
    allocations: props.allocations.allocations.map(allocation => allocation.id === id ? { ...allocation, ...patch } : allocation),
  });

  return (
    <div class="space-y-6 p-5">
      <section class="space-y-3">
        <Type as="h3" variant="body-strong">License</Type>
        <For each={presets}>{preset => (
          <button
            class="grid w-full grid-cols-[1fr_auto] items-center rounded-xl border border-border-soft p-4 text-start"
            onClick={() => props.onLicenseChange(preset.id)}
            type="button"
          >
            <Type as="span" variant="body">{preset.label}</Type>
            <RadioIndicator checked={props.license === preset.id} />
          </button>
        )}</For>
        <Show when={props.license === "commercial-remix"}>
          <label class="block space-y-2">
            <Type as="span" variant="body-strong">Downstream commercial remix share</Type>
            <div class="grid grid-cols-[1fr_auto] items-center rounded-xl border border-border-soft px-4">
              <Input
                aria-label="Downstream commercial remix share"
                class="border-0 px-0 shadow-none"
                inputmode="decimal"
                onChange={event => {
                  try { props.onCommercialRevShareBpsChange(percentTextToBasisPoints(event.currentTarget.value)); } catch { /* keep last valid integer value */ }
                }}
                value={basisPointsToPercentText(props.commercialRevShareBps)}
              />
              <span class="text-muted-foreground">%</span>
            </div>
          </label>
        </Show>
      </section>

      <section class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <Type as="h3" variant="body-strong">Creator allocation</Type>
            <Type as="p" variant="caption" class="text-muted-foreground">Recipient identities only. Wallets are resolved by the server.</Type>
          </div>
          <Type as="span" variant="label" class={total() === 10_000 ? "text-primary" : "text-destructive"}>
            {basisPointsToPercentText(Math.min(10_000, Math.max(0, total())))}%
          </Type>
        </div>
        <For each={props.allocations.allocations}>{(allocation, index) => (
          <div class="grid gap-2 rounded-xl border border-border-soft p-3 sm:grid-cols-[1fr_8rem_auto]">
            <Input
              aria-label={`Recipient ${index() + 1} id`}
              disabled={allocation.recipientKind === "creator"}
              onChange={event => update(allocation.id, { recipientId: event.currentTarget.value })}
              placeholder="persona id"
              value={allocation.recipientId ?? ""}
            />
            <div class="grid grid-cols-[1fr_auto] items-center rounded-xl border border-border-soft px-3">
              <Input
                aria-label={`Recipient ${index() + 1} share`}
                class="border-0 px-0 shadow-none"
                inputmode="decimal"
                onChange={event => {
                  try {
                    const shareBps = percentTextToBasisPoints(event.currentTarget.value);
                    update(allocation.id, { shareBps, sharePct: shareBps / 100 });
                  } catch { /* keep the last valid basis-point value */ }
                }}
                value={basisPointsToPercentText(allocationBps(allocation))}
              />
              <span class="text-muted-foreground">%</span>
            </div>
            <Show when={allocation.recipientKind !== "creator"} fallback={<span />}>
              <Button
                aria-label={`Remove recipient ${index() + 1}`}
                onClick={() => props.onAllocationsChange({ allocations: props.allocations.allocations.filter(item => item.id !== allocation.id) })}
                variant="ghost"
              >Remove</Button>
            </Show>
          </div>
        )}</For>
        <Button
          onClick={() => props.onAllocationsChange({
            allocations: [...props.allocations.allocations, {
              id: `recipient-${props.allocations.allocations.length + 1}`,
              recipientKind: "collaborator",
              recipientId: "",
              shareBps: 1,
              sharePct: 0.01,
            }],
          })}
          variant="outline"
        >Add collaborator</Button>
        <Show when={total() !== 10_000}>
          <Type as="p" variant="caption" class="text-destructive">Allocations must total exactly 100%.</Type>
        </Show>
      </section>
    </div>
  );
}
