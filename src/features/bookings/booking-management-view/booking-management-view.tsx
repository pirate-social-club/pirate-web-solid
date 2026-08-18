import { For, Show, createMemo } from "solid-js";

import {
  Avatar,
  Button,
  Card,
  CardContent,
  IconButton,
  IconCalendar,
  Skeleton,
  Type,
  cn,
} from "../../../design-system";
import {
  groupBookingManagementItems,
  managementToneClass,
  type BookingManagementItem,
} from "./booking-management-view-model";

export interface BookingManagementViewProps {
  state: "ready" | "loading" | "empty" | "error" | "signed-out";
  role: "host" | "booker";
  items?: BookingManagementItem[];
  errorMessage?: string;
  onRoleChange?: (role: "host" | "booker") => void;
  onJoin?: (item: BookingManagementItem) => void;
  onCancel?: (item: BookingManagementItem) => void;
  onAddToCalendar?: (item: BookingManagementItem) => void;
  onRetry?: () => void;
  onSignIn?: () => void;
  copy?: Partial<BookingManagementViewCopy>;
  class?: string;
}

interface BookingManagementViewCopy {
  title: string;
  roleLabel: string;
  asBooker: string;
  asHost: string;
  upcoming: string;
  review: string;
  past: string;
  cancelled: string;
  join: string;
  rejoin: string;
  addToCalendar: string;
  cancel: string;
  loading: string;
  signedOutTitle: string;
  signedOutDetail: string;
  signIn: string;
  errorTitle: string;
  errorDetail: string;
  retry: string;
  emptyTitle: string;
  emptyBookerDetail: string;
  emptyHostDetail: string;
}

const defaultBookingManagementViewCopy: BookingManagementViewCopy = {
  title: "Bookings", roleLabel: "Booking role", asBooker: "As booker", asHost: "As host",
  upcoming: "Upcoming", review: "Needs review", past: "Past", cancelled: "Cancelled",
  join: "Join session", rejoin: "Rejoin session", addToCalendar: "Add to calendar", cancel: "Cancel booking",
  loading: "Loading bookings", signedOutTitle: "Sign in to view your bookings", signedOutDetail: "Your upcoming and past sessions appear here.", signIn: "Sign in",
  errorTitle: "Bookings could not be loaded", errorDetail: "Try again in a moment.", retry: "Try again",
  emptyTitle: "No bookings yet", emptyBookerDetail: "Booked sessions will appear here.", emptyHostDetail: "Sessions booked with you will appear here.",
};

function ManagementCard(props: {
  item: BookingManagementItem;
  copy: BookingManagementViewCopy;
  onAddToCalendar?: (item: BookingManagementItem) => void;
  onCancel?: (item: BookingManagementItem) => void;
  onJoin?: (item: BookingManagementItem) => void;
}) {
  const item = () => props.item;
  return (
    <Card data-booking-id={item().id}>
      <CardContent class="flex flex-col gap-4 p-5">
        <div class="flex items-center gap-3">
          <Avatar fallback={item().counterpartyName} src={item().counterpartyAvatarUrl ?? undefined} />
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <div class="flex items-start justify-between gap-3">
              <Type class="min-w-0 truncate" title={item().counterpartyHandle} variant="body-strong">{item().counterpartyHandle}</Type>
              <Type class="shrink-0" variant="body-strong">{item().amountLabel}</Type>
            </div>
            <Type as="p" variant="caption">{item().sessionTimeLabel}</Type>
          </div>
        </div>
        <div class="flex flex-col gap-1 border-t border-border-soft pt-4">
          <Type class={managementToneClass(item().statusTone)} variant="body-strong">{item().statusLabel}</Type>
          <Type variant="caption">{item().statusDetail}</Type>
          <Show when={item().joinState === "unavailable" && item().joinAvailabilityLabel}>
            <Type variant="caption">{item().joinAvailabilityLabel}</Type>
          </Show>
        </div>
        <Show when={item().joinState === "available" || item().joinState === "live" || item().canCancel || item().canAddToCalendar}>
          <div class="flex flex-wrap items-center gap-2">
            <Show when={item().joinState === "available" || item().joinState === "live"}>
              <Button class="flex-1" onClick={() => props.onJoin?.(item())}>{item().joinState === "live" ? props.copy.rejoin : props.copy.join}</Button>
            </Show>
            <Show when={item().canAddToCalendar}>
              <IconButton aria-label={props.copy.addToCalendar} onClick={() => props.onAddToCalendar?.(item())} title={props.copy.addToCalendar} variant="outline">
                <IconCalendar aria-hidden="true" class="size-5" />
              </IconButton>
            </Show>
            <Show when={item().canCancel}>
              <Button onClick={() => props.onCancel?.(item())} variant="outline">{props.copy.cancel}</Button>
            </Show>
          </div>
        </Show>
      </CardContent>
    </Card>
  );
}

function LoadingState(props: { label: string }) {
  return (
    <div aria-label={props.label} class="flex flex-col gap-3">
      <For each={["loading-1", "loading-2"]}>
        {(key) => <Card data-loading-key={key}><CardContent class="flex gap-3 p-5"><Skeleton class="size-11 rounded-full" /><div class="flex flex-1 flex-col gap-2"><Skeleton class="h-5 w-36" /><Skeleton class="h-5 w-52" /><Skeleton class="h-5 w-28" /></div></CardContent></Card>}
      </For>
    </div>
  );
}

export function BookingManagementView(props: BookingManagementViewProps) {
  const copy = createMemo(() => ({ ...defaultBookingManagementViewCopy, ...props.copy }));
  const groups = () => groupBookingManagementItems(props.items ?? []);
  return (
    <div class={cn("mx-auto flex w-full max-w-2xl flex-col gap-6", props.class)} data-booking-management-state={props.state}>
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Type as="h1" variant="h2">{copy().title}</Type>
        <div aria-label={copy().roleLabel} class="flex gap-1 rounded-full border border-border-soft bg-card p-1" role="group">
          <button aria-pressed={props.role === "booker" ? "true" : "false"} class={cn("rounded-full px-4 py-2", props.role === "booker" && "bg-primary text-primary-foreground")} onClick={() => props.onRoleChange?.("booker")} type="button"><Type as="span" variant="body" class={props.role === "booker" ? "text-primary-foreground" : undefined}>{copy().asBooker}</Type></button>
          <button aria-pressed={props.role === "host" ? "true" : "false"} class={cn("rounded-full px-4 py-2", props.role === "host" && "bg-primary text-primary-foreground")} onClick={() => props.onRoleChange?.("host")} type="button"><Type as="span" variant="body" class={props.role === "host" ? "text-primary-foreground" : undefined}>{copy().asHost}</Type></button>
        </div>
      </div>

      <Show when={props.state === "loading"}><LoadingState label={copy().loading} /></Show>
      <Show when={props.state === "signed-out"}>
        <Card><CardContent class="flex flex-col items-start gap-4 p-6"><div class="flex flex-col gap-1"><Type variant="body-strong">{copy().signedOutTitle}</Type><Type variant="caption">{copy().signedOutDetail}</Type></div><Button onClick={props.onSignIn}>{copy().signIn}</Button></CardContent></Card>
      </Show>
      <Show when={props.state === "error"}>
        <Card><CardContent class="flex flex-col items-start gap-4 p-6"><div class="flex flex-col gap-1"><Type class="text-destructive" variant="body-strong">{copy().errorTitle}</Type><Type variant="caption">{props.errorMessage ?? copy().errorDetail}</Type></div><Button onClick={props.onRetry} variant="outline">{copy().retry}</Button></CardContent></Card>
      </Show>
      <Show when={props.state === "empty"}>
        <Card><CardContent class="flex flex-col gap-1 p-6"><Type variant="body-strong">{copy().emptyTitle}</Type><Type variant="caption">{props.role === "booker" ? copy().emptyBookerDetail : copy().emptyHostDetail}</Type></CardContent></Card>
      </Show>
      <Show when={props.state === "ready"}>
        <For each={groups()}>
          {(group) => <section class="flex flex-col gap-3"><Type as="h2" variant="h4">{{ upcoming: copy().upcoming, review: copy().review, past: copy().past, cancelled: copy().cancelled }[group.section]}</Type><For each={group.items}>{(item) => <ManagementCard copy={copy()} item={item} onAddToCalendar={props.onAddToCalendar} onCancel={props.onCancel} onJoin={props.onJoin} />}</For></section>}
        </For>
      </Show>
    </div>
  );
}

export type { BookingManagementItem } from "./booking-management-view-model";
