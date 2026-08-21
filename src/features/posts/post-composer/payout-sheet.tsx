// Song payout sub-sheet: the pushed editor behind the Payout summary row.
// Collaborators are added by handle — the only contract-valid path, since
// royalty_allocations[].recipient_id is a platform identity, not a wallet.
// The percent inputs only appear once there is more than one recipient, and
// charity is a single switch row rather than a recipient in the grid.

import { createSignal, For, Show } from "solid-js";

import {
  Avatar,
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

function handleInitials(handle: string): string {
  const stem = handle.replace(/^@/, "").replace(/\.pirate$/, "").trim();
  return stem.slice(0, 2).toUpperCase() || "?";
}

export function PayoutSheet(props: {
  controller: PostComposerController;
  onBack: () => void;
  onDone: () => void;
}) {
  const controller = props.controller;
  const copy = () => controller.copy.rights;
  const [handleQuery, setHandleQuery] = createSignal("");
  const [resolveError, setResolveError] = createSignal<string | null>(null);
  const [resolving, setResolving] = createSignal(false);
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

  const removeCollaborator = (id: string) => {
    controller.royaltySplit.update(() => ({
      allocations: allocations().filter((a) => a.id !== id),
    }));
  };

  const addByHandle = async () => {
    const handle = handleQuery().trim();
    if (!handle) return;
    const resolveHandle = controller.collaborator.resolveHandle;
    if (!resolveHandle) return;
    setResolveError(null);
    setResolving(true);
    try {
      const collaborator = await resolveHandle(handle);
      if (!collaborator) {
        setResolveError("No one with that handle.");
        return;
      }
      const pool = 100 - charityPct();
      const newCount = allocations().length + 1;
      const baseShare = Math.floor((pool / newCount) * 100) / 100;
      const remainder = Math.round((pool - baseShare * (newCount - 1)) * 100) / 100;
      controller.royaltySplit.update(() => ({
        allocations: [
          ...allocations().map((a) => ({ ...a, sharePct: baseShare })),
          {
            id: `collaborator-${Date.now()}`,
            recipientKind: "collaborator",
            recipientId: collaborator.profileId,
            displayHandle: collaborator.handle,
            avatarRef: collaborator.avatarRef,
            sharePct: remainder,
          },
        ],
      }));
      setHandleQuery("");
    } finally {
      setResolving(false);
    }
  };

  const percentValue = (allocation: { id: string; sharePct: number }) =>
    percentDrafts()[allocation.id] ?? String(allocation.sharePct);

  return (
    <div>
      <ModalHeader class="px-4 pe-12 text-start">
        <div class="flex items-center gap-1">
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

        <Show
          when={hasCollaborators()}
          fallback={
            <Type as="p" variant="caption" class="text-muted-foreground">
              Add a collaborator to split sales.
            </Type>
          }
        >
          <section class="space-y-2">
            <Type as="h3" variant="body-strong">Recipients</Type>
            <RecipientRow
              label="You"
              onPercentChange={(raw) => updateShare(creator()!.id, raw)}
              percentValue={percentValue(creator()!)}
            />
            <For each={collaborators()}>
              {(allocation, index) => (
                <RecipientRow
                  avatarRef={allocation.avatarRef}
                  handle={allocation.displayHandle}
                  label={allocation.displayHandle ?? `Collaborator ${index() + 1}`}
                  onPercentChange={(raw) => updateShare(allocation.id, raw)}
                  onRemove={() => removeCollaborator(allocation.id)}
                  percentValue={percentValue(allocation)}
                />
              )}
            </For>
          </section>
        </Show>

        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <Input
              aria-label="Add collaborator by handle"
              onChange={(event) => setHandleQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void addByHandle();
                }
              }}
              placeholder="Add collaborator by handle"
              value={handleQuery()}
            />
            <Button
              class="shrink-0"
              loading={resolving()}
              onClick={() => void addByHandle()}
              variant="outline"
            >
              Add
            </Button>
          </div>
          <Show when={resolveError()}>
            <Type as="p" variant="caption" class="text-destructive">
              {resolveError()}
            </Type>
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
  avatarRef?: string | null;
  handle?: string;
  label: string;
  onPercentChange?: (raw: string) => void;
  onRemove?: () => void;
  percentValue: string;
}) {
  return (
    <div class="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border-soft bg-card p-3">
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <Show
          when={props.handle}
          fallback={
            <span class="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-foreground">
              You
            </span>
          }
        >
          <Avatar
            fallback={handleInitials(props.handle!)}
            fallbackSeed={props.handle}
            size="md"
            src={props.avatarRef?.trim() || undefined}
          />
        </Show>
        <Type as="span" variant="body-strong" class="min-w-0 truncate">{props.label}</Type>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Show
          when={props.onPercentChange}
          fallback={
            <Type as="span" variant="body-strong" class="tabular-nums text-muted-foreground">
              {props.percentValue}%
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
