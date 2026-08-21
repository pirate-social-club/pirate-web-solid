// Song payout sub-sheet: the pushed editor behind the Payout summary row.
// Recipients are people first (handle search is the primary add path); raw
// wallet addresses live behind the Advanced disclosure as the fallback. The
// percent inputs only appear once there is more than one recipient, and
// charity is a single switch row rather than a recipient in the grid.

import { createSignal, For, Show } from "solid-js";

import {
  Button,
  IconArrowLeft,
  IconButton,
  IconTrash,
  Input,
  ModalHeader,
  ModalTitle,
  Switch,
  Type,
} from "../../../design-system";
import { defaultCharityContributionPct } from "./defaults";
import type { PostComposerController } from "./controller";
import type { AssetRoyaltySplitState } from "./types";

export function PayoutSheet(props: {
  controller: PostComposerController;
  onBack: () => void;
  onDone: () => void;
}) {
  const controller = props.controller;
  const copy = () => controller.copy.rights;
  const [advancedOpen, setAdvancedOpen] = createSignal(false);
  const [handleQuery, setHandleQuery] = createSignal("");
  const [percentDrafts, setPercentDrafts] = createSignal<Record<string, string>>({});

  const partner = () => controller.charity.partner;
  const charityPct = () => controller.charity.state.percentagePct;
  const allocations = () => controller.royaltySplit.state.allocations;
  const creator = () => allocations().find((a) => a.recipientKind === "creator");
  const collaborators = () => allocations().filter((a) => a.recipientKind === "collaborator");
  const hasCollaborators = () => collaborators().length > 0;
  const charityOn = () => Boolean(partner()) && charityPct() > 0;
  const displayCharityPct = () => (charityPct() > 0 ? charityPct() : defaultCharityContributionPct);

  const setCharity = (on: boolean) => {
    const nextPct = on ? defaultCharityContributionPct : 0;
    controller.charity.update((current) => ({
      ...current,
      percentagePct: nextPct,
      userConfigured: true,
    }));
    if (allocations().length === 1 && creator()) {
      controller.royaltySplit.update(() => ({
        allocations: [{ ...creator()!, sharePct: 100 - nextPct }],
      }));
    }
  };

  const updateShare = (id: string, raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, "");
    setPercentDrafts((prev) => ({ ...prev, [id]: cleaned }));
    const parsed = Number.parseFloat(cleaned);
    if (!Number.isFinite(parsed)) return;
    controller.royaltySplit.update(() => ({
      allocations: allocations().map((a) =>
        a.id === id ? { ...a, sharePct: Math.min(100, Math.max(0, parsed)) } : a
      ),
    }));
  };

  const updateWallet = (id: string, walletAddress: string) => {
    controller.royaltySplit.update(() => ({
      allocations: allocations().map((a) => (a.id === id ? { ...a, walletAddress } : a)),
    }));
  };

  const removeCollaborator = (id: string) => {
    controller.royaltySplit.update(() => ({
      allocations: allocations().filter((a) => a.id !== id),
    }));
  };

  const addWalletCollaborator = () => {
    controller.royaltySplit.update(() => ({
      allocations: [
        ...allocations(),
        {
          id: `collaborator-${allocations().length}-${Date.now()}`,
          recipientKind: "collaborator",
          walletAddress: "",
          sharePct: 0,
        },
      ],
    }));
  };

  const percentValue = (allocation: AssetRoyaltySplitState["allocations"][number]) =>
    percentDrafts()[allocation.id] ?? String(allocation.sharePct);

  return (
    <div>
      <ModalHeader class="pe-12 text-start">
        <div class="-ms-2 flex items-center gap-1">
          <IconButton aria-label="Back to rights" onClick={props.onBack} variant="ghost">
            <IconArrowLeft class="size-5" />
          </IconButton>
          <ModalTitle>{copy().payoutLabel}</ModalTitle>
        </div>
      </ModalHeader>

      <div class="space-y-5 px-4 pb-4 pt-2">
        <Show when={partner()}>
          <div class="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-border-soft bg-card p-4">
            <Type as="span" variant="body-strong">
              Give {displayCharityPct()}% to {partner()!.displayName}
            </Type>
            <Switch
              aria-label={`Give ${displayCharityPct()}% to ${partner()!.displayName}`}
              checked={charityOn()}
              onChange={setCharity}
            />
          </div>
        </Show>

        <section class="space-y-2">
          <Type as="h3" variant="body-strong">Recipients</Type>
          <RecipientRow
            label="You"
            onPercentChange={hasCollaborators() ? (raw) => updateShare(creator()!.id, raw) : undefined}
            percentValue={hasCollaborators() ? percentValue(creator()!) : `${creator()?.sharePct ?? 100}%`}
          />
          <For each={collaborators()}>
            {(allocation, index) => (
              <RecipientRow
                label={`Collaborator ${index() + 1}`}
                onPercentChange={(raw) => updateShare(allocation.id, raw)}
                onRemove={() => removeCollaborator(allocation.id)}
                percentValue={percentValue(allocation)}
              />
            )}
          </For>
        </section>

        <div class="space-y-2">
          <Input
            aria-label="Add collaborator by handle"
            onChange={(event) => setHandleQuery(event.currentTarget.value)}
            placeholder="Add collaborator by handle"
            value={handleQuery()}
          />
        </div>

        <div class="rounded-[var(--radius-lg)] border border-border-soft bg-card">
          <button
            aria-expanded={advancedOpen() ? "true" : "false"}
            class="flex w-full items-center justify-between gap-3 px-4 py-3 text-start outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setAdvancedOpen((current) => !current)}
            type="button"
          >
            <Type as="span" variant="body-strong">Advanced</Type>
            <Type as="span" variant="label" class="text-muted-foreground">
              {advancedOpen() ? "Hide" : "Show"}
            </Type>
          </button>
          <Show when={advancedOpen()}>
            <div class="space-y-3 border-t border-border-soft p-4">
              <For each={allocations()}>
                {(allocation) => (
                  <Show
                    when={allocation.recipientKind === "creator"}
                    fallback={
                      <Input
                        aria-label="Wallet address"
                        onChange={(event) => updateWallet(allocation.id, event.currentTarget.value)}
                        placeholder="0x…"
                        value={allocation.walletAddress ?? ""}
                      />
                    }
                  >
                    <Type as="p" variant="caption" class="text-muted-foreground">
                      Your share pays out to your primary wallet on your profile.
                    </Type>
                  </Show>
                )}
              </For>
              <Button class="w-full" onClick={addWalletCollaborator} variant="outline">
                Add wallet address
              </Button>
            </div>
          </Show>
        </div>

        <Button class="w-full" onClick={props.onDone} size="lg">
          {copy().done}
        </Button>
      </div>
    </div>
  );
}

function RecipientRow(props: {
  label: string;
  onPercentChange?: (raw: string) => void;
  onRemove?: () => void;
  percentValue: string;
}) {
  return (
    <div class="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border-soft bg-card p-4">
      <Type as="span" variant="body-strong" class="min-w-0 truncate">{props.label}</Type>
      <div class="flex shrink-0 items-center gap-2">
        <Show
          when={props.onPercentChange}
          fallback={
            <Type as="span" variant="body-strong" class="tabular-nums text-muted-foreground">
              {props.percentValue}
            </Type>
          }
        >
          <Input
            aria-label={`${props.label} percentage`}
            class="h-10 w-16 rounded-[var(--radius-lg)] px-2 text-end tabular-nums"
            inputmode="decimal"
            onChange={(event) => props.onPercentChange?.(event.currentTarget.value)}
            value={props.percentValue}
          />
          <span class="text-base font-semibold text-muted-foreground">%</span>
        </Show>
        <Show when={props.onRemove}>
          <IconButton aria-label={`Remove ${props.label}`} onClick={props.onRemove} variant="ghost">
            <IconTrash class="size-5" />
          </IconButton>
        </Show>
      </div>
    </div>
  );
}
