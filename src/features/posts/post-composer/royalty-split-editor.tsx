// Royalty split editor (sale proceeds between charity and payout wallets),
// ported from the React royalty-split-editor.tsx.

import { createEffect, createSignal, For, Show } from "solid-js";

import {
  Avatar,
  Button,
  IconPlus,
  IconTrash,
  IconWallet,
  Input,
  Type,
} from "../../../design-system";
import { cn } from "../../../design-system";
import { defaultCharityContributionPct } from "./defaults";
import type {
  AssetRoyaltySplitState,
  CharityContributionState,
  CommunityCharityPartner,
} from "./types";

export type { AssetRoyaltySplitState } from "./types";

function buildAvatarFallback(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "C";
  return trimmed
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "C";
}

function displayPct(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/u, "");
}

const percentInputClass = "h-11 rounded-none border-0 bg-transparent px-0 text-end tabular-nums shadow-none focus-visible:ring-0";

export function RoyaltySplitEditor(props: {
  charityContribution?: CharityContributionState;
  charityPartner?: CommunityCharityPartner | null;
  onChange: (value: AssetRoyaltySplitState) => void;
  onCharityContributionChange?: (updater: (current: CharityContributionState) => CharityContributionState) => void;
  value: AssetRoyaltySplitState;
}) {
  // Raw per-row percent input while editing, so intermediate values like "9."
  // or "9.7" are preserved instead of being rounded on every keystroke.
  const [percentDrafts, setPercentDrafts] = createSignal<Record<string, string>>({});
  const rawCharityPct = () => props.charityContribution?.percentagePct ?? 0;
  const charityPct = () => props.charityPartner ? Math.min(50, Math.max(0, rawCharityPct())) : 0;
  const singleCreatorOnly = () => props.value.allocations.length === 1 && props.value.allocations[0]?.recipientKind === "creator";
  const totalWalletSharePct = () => props.value.allocations.reduce((sum, allocation) => sum + allocation.sharePct, 0);
  const totalSharePct = () => charityPct() + totalWalletSharePct();
  const creatorSharePct = () => props.value.allocations
    .filter((allocation) => allocation.recipientKind === "creator")
    .reduce((sum, allocation) => sum + allocation.sharePct, 0);
  const hasDuplicateWallets = () => {
    const normalizedWallets = props.value.allocations
      .map((allocation) => (allocation.walletAddress ?? "").trim().toLowerCase())
      .filter(Boolean);
    return new Set(normalizedWallets).size !== normalizedWallets.length;
  };
  const hasZeroShare = () => props.value.allocations.some((allocation) => allocation.sharePct <= 0);

  const updateForSoloCreator = (nextCharityPct: number) => {
    if (!singleCreatorOnly()) return;
    const creator = props.value.allocations[0];
    if (!creator) return;
    const nextCreatorSharePct = 100 - nextCharityPct;
    if (creator.sharePct === nextCreatorSharePct) return;
    props.onChange({
      allocations: [{
        ...creator,
        sharePct: nextCreatorSharePct,
      }],
    });
  };

  const updateCharityPct = (nextCharityPct: number) => {
    const clamped = Math.min(50, Math.max(0, nextCharityPct));
    props.onCharityContributionChange?.((current) => ({
      ...current,
      percentagePct: clamped,
    }));
    updateForSoloCreator(clamped);
  };

  const updateAllocation = (
    allocationId: string,
    patch: Partial<AssetRoyaltySplitState["allocations"][number]>,
  ) => {
    props.onChange({
      allocations: props.value.allocations.map((allocation) =>
        allocation.id === allocationId ? { ...allocation, ...patch } : allocation
      ),
    });
  };

  // Keep the solo row filled from the charity field. User-driven changes are
  // routed through updateCharityPct, so this only catches external state loads.
  createEffect(
    () => charityPct(),
    (pct) => updateForSoloCreator(pct),
  );

  createEffect(
    () => [props.charityPartner, rawCharityPct(), charityPct()] as const,
    ([partner, raw, clamped]) => {
      if (!partner || raw === clamped) return;
      props.onCharityContributionChange?.((current) => ({
        ...current,
        percentagePct: clamped,
      }));
    },
  );

  return (
    <div class="space-y-4 rounded-[var(--radius-lg)] border border-border-soft bg-card p-4">
      <div class="flex items-start justify-between gap-4">
        <div class="space-y-1">
          <Type as="div" variant="body-strong">Sale proceeds</Type>
          <Type as="p" variant="body" class="text-muted-foreground">
            Split each sale between charity and payout wallets.
          </Type>
        </div>
        <div class={cn(
          "shrink-0 rounded-full px-3 py-1 font-semibold tabular-nums",
          totalSharePct() === 100
            ? "bg-primary-subtle text-primary"
            : "bg-destructive/10 text-destructive",
        )}>
          {displayPct(totalSharePct())}%
        </div>
      </div>

      <div class="space-y-3">
        <Show when={props.charityPartner && charityPct() === 0}>
          <Button
            class="w-full justify-start"
            leadingIcon={<IconPlus class="size-4" />}
            onClick={() => updateCharityPct(defaultCharityContributionPct)}
            variant="outline"
          >
            Add charity
          </Button>
        </Show>
        <Show when={props.charityPartner && charityPct() > 0}>
          <div class="grid items-center gap-3 rounded-[var(--radius-lg)] border border-border-soft bg-background p-3 sm:grid-cols-[1fr_7rem_auto] sm:p-4">
            <div class="flex min-w-0 items-center gap-3">
              <Avatar
                class="border-border-soft bg-card"
                fallback={buildAvatarFallback(props.charityPartner!.displayName)}
                size="md"
                src={props.charityPartner!.imageUrl?.trim() || undefined}
              />
              <div class="min-w-0">
                <Type as="div" variant="body-strong" class="truncate">
                  {props.charityPartner!.displayName}
                </Type>
                <Type as="div" variant="caption" class="text-muted-foreground">
                  Charity
                </Type>
              </div>
            </div>
            <div class="grid h-11 grid-cols-[minmax(0,1fr)_1.25rem] items-center rounded-full border border-input bg-background px-4 shadow-sm">
              <Input
                aria-label="Charity percentage"
                class={percentInputClass}
                inputmode="numeric"
                onChange={(event) => {
                  const raw = event.currentTarget.value.replace(/[^0-9]/gu, "");
                  updateCharityPct(raw === "" ? 0 : Number.parseInt(raw, 10));
                }}
                type="text"
                value={charityPct() === 0 ? "" : String(charityPct())}
              />
              <span class="text-end font-semibold text-muted-foreground">%</span>
            </div>
            <Button
              aria-label="Remove charity donation"
              class="h-11 w-11 self-stretch sm:size-11 sm:self-center"
              onClick={() => updateCharityPct(0)}
              size="icon"
              variant="ghost"
            >
              <IconTrash class="size-5" />
            </Button>
          </div>
        </Show>
        <For each={props.value.allocations}>
          {(allocation, index) => {
            const isCreator = allocation.recipientKind === "creator";
            return (
              <div class="grid items-center gap-3 rounded-[var(--radius-lg)] border border-border-soft bg-background p-3 sm:grid-cols-[1fr_7rem_auto] sm:p-4">
                <div class="flex min-w-0 items-center gap-3">
                  <span class="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                    <IconWallet class="size-5" />
                  </span>
                  <Show
                    when={isCreator}
                    fallback={
                      <Input
                        aria-label={`Recipient ${index() + 1} wallet address`}
                        class="h-11 min-w-0 flex-1 font-mono"
                        onChange={(event) => updateAllocation(allocation.id, { walletAddress: event.currentTarget.value })}
                        placeholder="0x..."
                        value={allocation.walletAddress ?? ""}
                      />
                    }
                  >
                    {/* Creator wallet is read-only: it must be your primary
                        wallet, and registration mints the IP + your share to it. */}
                    <div class="flex min-w-0 flex-1 items-center gap-2">
                      <Type as="span" variant="body-strong" class="shrink-0 text-foreground">
                        You
                      </Type>
                      <Type
                        as="span"
                        variant="body"
                        class="min-w-0 flex-1 truncate font-mono text-muted-foreground"
                        title={allocation.walletAddress ?? undefined}
                      >
                        {allocation.walletAddress?.trim() || ""}
                      </Type>
                    </div>
                  </Show>
                </div>
                <div class="grid h-11 grid-cols-[minmax(0,1fr)_1.25rem] items-center rounded-full border border-input bg-background px-4 shadow-sm">
                  <Input
                    aria-label={isCreator ? "Your royalty percentage" : `Recipient ${index() + 1} royalty percentage`}
                    class={percentInputClass}
                    disabled={singleCreatorOnly()}
                    inputmode="decimal"
                    onBlur={() => setPercentDrafts((prev) => {
                      if (!(allocation.id in prev)) return prev;
                      const next = { ...prev };
                      delete next[allocation.id];
                      return next;
                    })}
                    onChange={(event) => {
                      const raw = event.currentTarget.value.replace(/[^0-9.]/gu, "");
                      setPercentDrafts((prev) => ({ ...prev, [allocation.id]: raw }));
                      const parsed = Number.parseFloat(raw);
                      // Clamp to [0, 100] but do not round here; finer-than-bps
                      // precision is rejected by validation before publishing.
                      if (Number.isFinite(parsed)) {
                        updateAllocation(allocation.id, { sharePct: Math.min(100, Math.max(0, parsed)) });
                      }
                    }}
                    type="text"
                    value={percentDrafts()[allocation.id] ?? allocation.sharePct}
                  />
                  <span class="text-end font-semibold text-muted-foreground">%</span>
                </div>
                <Show
                  when={!isCreator}
                  fallback={<span aria-hidden="true" class="hidden sm:block sm:size-11" />}
                >
                  <Button
                    aria-label={`Remove recipient ${index() + 1}`}
                    class="h-11 w-11 self-stretch sm:size-11 sm:self-center"
                    onClick={() => props.onChange({
                      allocations: props.value.allocations.filter((item) => item.id !== allocation.id),
                    })}
                    size="icon"
                    variant="ghost"
                  >
                    <IconTrash class="size-5" />
                  </Button>
                </Show>
              </div>
            );
          }}
        </For>
      </div>

      <Button
        class="w-full"
        leadingIcon={<IconPlus class="size-4" />}
        onClick={() => {
          const nextWalletCount = props.value.allocations.length + 1;
          const walletPoolPct = 100 - charityPct();
          const baseSharePct = Math.floor((walletPoolPct / nextWalletCount) * 100) / 100;
          const allocatedPct = baseSharePct * nextWalletCount;
          const lastSharePct = Math.round((baseSharePct + walletPoolPct - allocatedPct) * 100) / 100;
          props.onChange({
            allocations: [
              ...props.value.allocations.map((allocation) => ({
                ...allocation,
                sharePct: baseSharePct,
              })),
              {
                id: `recipient-${props.value.allocations.length}-${Date.now()}`,
                recipientKind: "collaborator" as const,
                sharePct: lastSharePct,
              },
            ],
          });
        }}
        variant="outline"
      >
        Add wallet
      </Button>

      <Show
        when={creatorSharePct() === 0}
        fallback={
          <Show
            when={hasZeroShare()}
            fallback={
              <Show
                when={hasDuplicateWallets()}
                fallback={
                  <Show
                    when={totalSharePct() !== 100}
                    fallback={
                      <Type as="p" variant="caption" class="text-muted-foreground">
                        The split becomes fixed when the asset is registered on Story.
                      </Type>
                    }
                  >
                    <Type as="p" variant="caption" class="text-destructive">
                      Sale proceeds must total 100% before publishing.
                    </Type>
                  </Show>
                }
              >
                <Type as="p" variant="caption" class="text-destructive">
                  Each wallet can appear only once.
                </Type>
              </Show>
            }
          >
            <Type as="p" variant="caption" class="text-destructive">
              Every recipient needs a share greater than 0%.
            </Type>
          </Show>
        }
      >
        <Type as="p" variant="caption" class="text-destructive">
          You need to receive at least some royalty.
        </Type>
      </Show>
    </div>
  );
}
