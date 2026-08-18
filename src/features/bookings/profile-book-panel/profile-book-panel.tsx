import { Show, createMemo } from "solid-js";

import { AvailabilityCalendar } from "../availability-calendar/availability-calendar";
import { Button, Card, Type, cn } from "../../../design-system";
import type { IanaTz, ResolvedSlot } from "../view-models";
import { profileBookEmptyLabel, sessionFactsLine } from "./profile-book-panel-model";

interface ProfileBookPanelViewerProps {
  mode: "viewer";
  startingPriceCents: number;
  slots: ResolvedSlot[];
  loading?: boolean;
  viewerTimezone: IanaTz;
  getSlotHref?: (slot: ResolvedSlot) => string;
  onSelectSlot?: (slot: ResolvedSlot, event?: MouseEvent) => void;
  class?: string;
}

interface ProfileBookPanelOwnerProps {
  mode: "owner";
  configured: boolean;
  basePriceCents: number;
  slots: ResolvedSlot[];
  loading?: boolean;
  viewerTimezone: IanaTz;
  onEdit?: () => void;
  class?: string;
}

export type ProfileBookPanelProps = ProfileBookPanelViewerProps | ProfileBookPanelOwnerProps;

function OwnerBookPanel(props: ProfileBookPanelOwnerProps) {
  return (
    <Show when={props.configured} fallback={<Card class={cn("flex flex-col gap-4 border-border bg-card p-5 shadow-none", props.class)}><Type variant="body">Set up a schedule so people can book time with you.</Type><Button onClick={props.onEdit}>Set up bookings</Button></Card>}>
      <div class={cn("flex flex-col gap-4", props.class)} data-profile-book-panel="owner-configured">
        <div class="flex items-center justify-between gap-3"><Type as="h2" variant="h3">Your availability</Type><Button onClick={props.onEdit} size="sm" variant="outline">Edit schedule</Button></div>
        <Show when={!props.loading} fallback={<Type variant="caption">Loading availability…</Type>}>
          <Show when={props.slots.length > 0} fallback={<Type variant="caption">{profileBookEmptyLabel("owner")}</Type>}>
            <Type variant="caption">{sessionFactsLine(props.slots, props.viewerTimezone, props.basePriceCents)}</Type>
            <AvailabilityCalendar slots={props.slots} viewerTimezone={props.viewerTimezone} />
          </Show>
        </Show>
      </div>
    </Show>
  );
}

function ViewerBookPanel(props: ProfileBookPanelViewerProps) {
  return (
    <div class={cn("flex h-full min-h-0 flex-col gap-3", props.class)} data-profile-book-panel="viewer">
      <Show when={!props.loading} fallback={<Type variant="caption">Loading availability…</Type>}>
        <Show when={props.slots.length > 0} fallback={<Type variant="caption">{profileBookEmptyLabel("viewer")}</Type>}>
          <Type variant="body-strong">{sessionFactsLine(props.slots, props.viewerTimezone, props.startingPriceCents)}</Type>
          <AvailabilityCalendar class="min-h-0 flex-1" getSlotHref={props.getSlotHref} onSelectSlot={props.onSelectSlot} slots={props.slots} viewerTimezone={props.viewerTimezone} />
        </Show>
      </Show>
    </div>
  );
}

export function ProfileBookPanel(props: ProfileBookPanelProps) {
  const isOwner = createMemo(() => props.mode === "owner");
  // SAFETY: the discriminated `mode` prop is the same invariant used to select each branch.
  return <Show when={isOwner()} fallback={<ViewerBookPanel {...(props as ProfileBookPanelViewerProps)} />}><OwnerBookPanel {...(props as ProfileBookPanelOwnerProps)} /></Show>;
}
