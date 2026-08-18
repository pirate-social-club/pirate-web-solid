/** @jsxImportSource @solidjs/web */
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";

import { Button, Card, CardContent, Type, buttonVariants, cn } from "../../../design-system";
import {
  formatCentsAsUsd,
  formatSlotDuration,
  formatSlotTime,
  formatTzAbbrev,
  getSlotUniformity,
} from "../booking-format";
import type { IanaTz, IsoInstant, ResolvedSlot } from "../view-models";
import {
  defaultAvailabilityDayKey,
  findSelectedAvailabilitySlot,
  getAvailabilityFooterModel,
  groupSlotsByDay,
  isAvailabilityInteractive,
} from "./availability-calendar-model";

export interface AvailabilityCalendarProps {
  slots: ResolvedSlot[];
  viewerTimezone: IanaTz;
  selectedStartUtc?: IsoInstant;
  getSlotHref?: (slot: ResolvedSlot) => string;
  onSelectSlot?: (slot: ResolvedSlot, event?: MouseEvent) => void;
  class?: string;
}

export function AvailabilityCalendar(props: AvailabilityCalendarProps) {
  const dayGroups = createMemo(() => groupSlotsByDay(props.slots, props.viewerTimezone));
  const uniformity = createMemo(() => getSlotUniformity(props.slots));
  const interactive = () => isAvailabilityInteractive(props.onSelectSlot, props.getSlotHref);
  const [activeDayKey, setActiveDayKey] = createSignal<string | null>(
    defaultAvailabilityDayKey(dayGroups()),
    { ownedWrite: true },
  );
  const [chosenStartUtc, setChosenStartUtc] = createSignal<IsoInstant | null>(null, { ownedWrite: true });
  let listRef: HTMLDivElement | undefined;

  createEffect(
    () => dayGroups(),
    (groups) => {
      setActiveDayKey(defaultAvailabilityDayKey(groups));
      setChosenStartUtc(null);
    },
  );

  const activeDay = createMemo(() =>
    dayGroups().find((day) => day.dateKey === activeDayKey()) ?? dayGroups()[0],
  );
  const activeDayLabel = createMemo(() => activeDay()?.label ?? "");
  const activeDaySlots = createMemo(() => activeDay()?.slots ?? []);
  const activeDayAmbiguousTimes = createMemo(() => activeDay()?.ambiguousTimes ?? new Set<string>());
  const effectiveSelectedStart = () => chosenStartUtc() ?? props.selectedStartUtc;
  const selectedSlot = createMemo(() => findSelectedAvailabilitySlot(props.slots, effectiveSelectedStart()));
  const selectedInteractiveSlot = createMemo(() => interactive() ? selectedSlot() : undefined);

  const selectDay = (dateKey: string) => {
    setActiveDayKey(dateKey);
    listRef?.scrollTo?.({ top: 0 });
  };

  const continueWithSelection = (event: MouseEvent) => {
    const slot = selectedSlot();
    if (slot) props.onSelectSlot?.(slot, event);
  };

  return (
    <Show
      when={props.slots.length > 0}
      fallback={
        <Card class={props.class}>
          <CardContent class="p-6 text-center">
            <Type variant="caption">No open slots in this window.</Type>
          </CardContent>
        </Card>
      }
    >
      <div class={cn("flex min-h-0 flex-col gap-3", props.class)}>
        <div
          class="flex shrink-0 gap-2 overflow-x-auto overscroll-x-contain pb-1 [touch-action:pan-x]"
          data-booking-day-strip
        >
          <For each={dayGroups()}>
            {(day) => {
              const isActive = () => day.dateKey === activeDay()?.dateKey;
              return (
                <button
                  aria-pressed={isActive() ? "true" : "false"}
                  class={cn(
                    "flex shrink-0 flex-col items-center rounded-[var(--radius-md)] border px-3 py-1.5 transition-colors",
                    isActive()
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border-soft bg-card hover:bg-card/85",
                  )}
                  onClick={() => selectDay(day.dateKey)}
                  type="button"
                >
                  <Type variant="caption" class={cn(isActive() && "text-primary-foreground")}>
                    {day.weekdayShort}
                  </Type>
                  <Type variant="body-strong" class={cn(isActive() && "text-primary-foreground")}>
                    {day.dayOfMonth}
                  </Type>
                </button>
              );
            }}
          </For>
        </div>

        <div
          class="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          ref={(element) => { listRef = element; }}
        >
          <Show when={activeDay()}>
            <>
              <Type as="h3" variant="label" class="mb-2">
                {activeDayLabel()}
              </Type>
              <Show
                when={activeDaySlots().some((slot) => slot.available)}
                fallback={<Type as="p" variant="caption" class="text-muted-foreground">No open times this day.</Type>}
              >
                <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <For each={activeDaySlots()}>
                    {(slot) => {
                      const isSelected = () => slot.available && slot.startUtc === effectiveSelectedStart();
                      const timeLabel = formatSlotTime(slot.startUtc, props.viewerTimezone);
                      const displayTime = activeDayAmbiguousTimes().has(timeLabel)
                        ? `${timeLabel} ${formatTzAbbrev(slot.startUtc, props.viewerTimezone)}`
                        : timeLabel;
                      const content = () => (
                        <>
                          <Type variant="body-strong" class={cn("whitespace-nowrap", isSelected() && "text-primary-foreground")}>
                            {displayTime}
                          </Type>
                          <Show when={!uniformity().sameDuration}>
                            <Type variant="caption" class={cn(isSelected() && "text-primary-foreground")}>
                              {formatSlotDuration(slot.startUtc, slot.endUtc)}
                            </Type>
                          </Show>
                          <Show when={!uniformity().samePrice}>
                            <Type variant="caption" class={cn(isSelected() && "text-primary-foreground")}>
                              {formatCentsAsUsd(slot.priceCents)}
                            </Type>
                          </Show>
                        </>
                      );
                      const chipClass = () => cn(
                        "flex flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] border px-2 py-2.5 text-center transition-colors",
                        slot.available
                          ? isSelected()
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border-soft bg-card hover:bg-card/85"
                          : "border-border-soft bg-surface-skeleton opacity-50",
                      );

                      return (
                        <Show
                          when={interactive()}
                          fallback={<div class={chipClass()}>{content()}</div>}
                        >
                          <button
                            aria-pressed={isSelected() ? "true" : "false"}
                            class={chipClass()}
                            disabled={!slot.available}
                            onClick={() => setChosenStartUtc(slot.startUtc)}
                            type="button"
                          >
                            {content()}
                          </button>
                        </Show>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </>
          </Show>
        </div>

        <Show when={selectedInteractiveSlot()}>
          {(slot) => {
            const continueHref = () => props.getSlotHref?.(slot());
            const footer = () => getAvailabilityFooterModel(slot(), props.viewerTimezone);
            return (
              <div
                class="flex shrink-0 items-center justify-between gap-3 border-t border-border-soft bg-card pt-3"
                data-booking-confirm-footer
              >
                <div class="min-w-0">
                  <Type as="p" variant="body-strong" class="whitespace-nowrap">
                    {footer().date}{" · "}{footer().time}
                  </Type>
                  <Type as="p" variant="caption" class="text-muted-foreground">
                    {footer().duration}{" · "}{footer().price}
                  </Type>
                </div>
                <Show
                  when={continueHref()}
                  fallback={<Button onClick={continueWithSelection} size="sm">Continue</Button>}
                >
                  <a
                    class={buttonVariants({ size: "sm" })}
                    href={continueHref()}
                    onClick={continueWithSelection}
                  >
                    Continue
                  </a>
                </Show>
              </div>
            );
          }}
        </Show>
      </div>
    </Show>
  );
}
