/** @jsxImportSource @solidjs/web */

import { For, Show, createMemo, createSignal } from "solid-js";
import type { JSX } from "@solidjs/web";

import {
  Button,
  Card,
  CardContent,
  FormFieldLabel,
  FormNote,
  Input,
  Switch,
  Type,
  cn,
} from "../../../design-system";
import { useUiLocale } from "../../../lib/ui-locale";
import { resolveLocaleLanguageTag } from "../../../lib/ui-locale-core";
import { getLocaleMessages } from "../../../locales";
import {
  formatExceptionSummary,
  formatPriceRuleSummary,
  formatProfileDuration,
  formatRuleSummary,
  profileBookingsStateLabel,
  PROFILE_BOOKING_WEEKDAYS,
  type AvailabilityExceptionDraft,
  type AvailabilityRuleDraft,
  type PriceRuleDraft,
  type ProfileBookingsValues,
} from "./profile-bookings-section-model";

const BOOKING_DURATION_SECONDS = [900, 1800, 2700, 3600] as const;

export interface ProfileBookingsSectionProps {
  values: ProfileBookingsValues;
  rules: AvailabilityRuleDraft[];
  priceRules: PriceRuleDraft[];
  exceptions: AvailabilityExceptionDraft[];
  bookable: boolean;
  payoutReady: boolean;
  timezoneOptions: string[];
  saving?: boolean;
  toggling?: boolean;
  busy?: boolean;
  basePriceError?: string | null;
  class?: string;
  onValuesChange?: (patch: Partial<ProfileBookingsValues>) => void;
  onRulesChange?: (rules: AvailabilityRuleDraft[]) => void;
  onPriceRulesChange?: (rules: PriceRuleDraft[]) => void;
  onExceptionsChange?: (exceptions: AvailabilityExceptionDraft[]) => void;
  onToggleBookable?: () => void;
}

function SettingsSection(props: { id: string; title: string; children: JSX.Element }) {
  return (
    <section aria-labelledby={props.id} class="flex flex-col gap-4" data-profile-bookings-section={props.id}>
      <Type as="h2" id={props.id} variant="h3">{props.title}</Type>
      {props.children}
    </section>
  );
}

function SectionCard(props: { children: JSX.Element }) {
  return (
    <Card class="border-0 bg-transparent p-0 shadow-none sm:border sm:border-border-soft sm:bg-card">
      <CardContent class="flex flex-col gap-4 p-0 sm:p-5">{props.children}</CardContent>
    </Card>
  );
}

function WeekdayPicker(props: {
  selected: number[];
  label: string;
  onToggle: (day: number, checked: boolean) => void;
}) {
  return (
    <div aria-label={props.label} class="flex flex-wrap gap-2" role="group">
      <For each={PROFILE_BOOKING_WEEKDAYS}>
        {(dayLabel, day) => (
          <label class="flex items-center gap-2 rounded-full border border-border-soft px-3 py-2">
            <input
              aria-label={`${dayLabel} ${props.label}`}
              checked={props.selected.includes(day())}
              onChange={(event) => props.onToggle(day(), event.currentTarget.checked)}
              type="checkbox"
            />
            <Type as="span" variant="caption">{dayLabel}</Type>
          </label>
        )}
      </For>
    </div>
  );
}

function ListRow(props: { children: JSX.Element; onRemove?: () => void; removeLabel: string; removeName: string }) {
  return (
    <div class="flex items-center justify-between gap-3 rounded-lg border border-border-soft p-3">
      <Type class="min-w-0 break-words" variant="body">{props.children}</Type>
      <Show when={props.onRemove}>
        <Button aria-label={`${props.removeLabel} ${props.removeName}`} onClick={props.onRemove} size="sm" type="button" variant="ghost">
          {props.removeLabel}
        </Button>
      </Show>
    </div>
  );
}

function parseExceptionKind(value: string): "block" | "open" {
  return value === "open" ? "open" : "block";
}

export function ProfileBookingsSection(props: ProfileBookingsSectionProps) {
  const locale = useUiLocale();
  const copy = () => getLocaleMessages(locale, "routes").settings.booking;
  const localeTag = () => resolveLocaleLanguageTag(locale);
  const busy = createMemo(() => Boolean(props.busy));
  const stateLabel = createMemo(() => profileBookingsStateLabel({
    bookable: props.bookable,
    payoutReady: props.payoutReady,
    rules: props.rules,
  }));

  const [ruleWeekdays, setRuleWeekdays] = createSignal<number[]>([1, 2, 3, 4, 5]);
  const [ruleStart, setRuleStart] = createSignal("09:00");
  const [ruleEnd, setRuleEnd] = createSignal("17:00");
  const [priceWeekdays, setPriceWeekdays] = createSignal<number[]>([1, 2, 3, 4, 5]);
  const [priceStart, setPriceStart] = createSignal("09:00");
  const [priceEnd, setPriceEnd] = createSignal("12:00");
  const [priceRuleUsd, setPriceRuleUsd] = createSignal("75.00");
  const [exceptionKind, setExceptionKind] = createSignal<"block" | "open">("block");
  const [exceptionStart, setExceptionStart] = createSignal("");
  const [exceptionEnd, setExceptionEnd] = createSignal("");
  let sequence = 100;
  const nextId = (prefix: string) => `${prefix}-${++sequence}`;

  const addRule = () => {
    if (busy() || ruleWeekdays().length === 0) return;
    props.onRulesChange?.([
      ...props.rules,
      {
        id: nextId("rule"),
        byWeekday: [...ruleWeekdays()].sort((a, b) => a - b),
        startLocal: ruleStart(),
        endLocal: ruleEnd(),
        slotDurationMinutes: Math.max(5, Math.round(props.values.durationSeconds / 60)),
      },
    ]);
  };
  const addPriceRule = () => {
    if (busy() || priceWeekdays().length === 0) return;
    const priceCents = Math.round(Number(priceRuleUsd()) * 100);
    if (!Number.isFinite(priceCents) || priceCents <= 0) return;
    props.onPriceRulesChange?.([
      ...props.priceRules,
      {
        id: nextId("price"),
        matchWeekday: [...priceWeekdays()].sort((a, b) => a - b),
        startLocal: priceStart(),
        endLocal: priceEnd(),
        priceCents,
      },
    ]);
  };
  const addException = () => {
    if (busy() || !exceptionStart() || !exceptionEnd()) return;
    props.onExceptionsChange?.([
      ...props.exceptions,
      {
        id: nextId("exception"),
        kind: exceptionKind(),
        startUtc: `${exceptionStart()}:00Z`,
        endUtc: `${exceptionEnd()}:00Z`,
      },
    ]);
  };

  return (
    <div
      aria-busy={busy() ? "true" : "false"}
      class={cn("mx-auto flex w-full max-w-3xl flex-col gap-8", props.class)}
      data-profile-settings-section="bookings"
      data-profile-bookings-state={stateLabel()}
    >
      <SettingsSection id="profile-bookings-overview" title={copy().sectionTitle}>
        <Type as="p" class="text-muted-foreground" variant="caption">{copy().intro}</Type>
        <SectionCard>
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-2">
              <FormFieldLabel htmlFor="profile-bookings-timezone" label={copy().timezoneLabel} />
              <select
                aria-label={copy().timezoneLabel}
                class="h-11 w-full rounded-full border border-border-soft bg-card px-4"
                id="profile-bookings-timezone"
                onChange={(event) => props.onValuesChange?.({ timezone: event.currentTarget.value })}
                value={props.values.timezone}
              >
                <For each={props.timezoneOptions}>{(timezone) => <option value={timezone}>{timezone}</option>}</For>
              </select>
            </div>
            <div class="flex flex-col gap-2">
              <FormFieldLabel htmlFor="profile-bookings-duration" label={copy().durationLabel} />
              <select
                aria-label={copy().durationLabel}
                class="h-11 w-full rounded-full border border-border-soft bg-card px-4"
                id="profile-bookings-duration"
                onChange={(event) => props.onValuesChange?.({ durationSeconds: Number(event.currentTarget.value) })}
                value={String(props.values.durationSeconds)}
              >
                <For each={BOOKING_DURATION_SECONDS}>
                  {(duration) => <option value={duration}>{formatProfileDuration(duration, copy().durationMinutes)}</option>}
                </For>
              </select>
            </div>
            <div class="flex flex-col gap-2">
              <FormFieldLabel htmlFor="profile-bookings-price" label={copy().basePriceLabel} />
              <Input
                aria-describedby={props.basePriceError ? "profile-bookings-price-error" : undefined}
                id="profile-bookings-price"
                min="0"
                onInput={(event) => props.onValuesChange?.({ priceUsd: event.currentTarget.value })}
                placeholder="0.00"
                step="0.01"
                type="number"
                value={props.values.priceUsd}
              />
              <Show when={props.basePriceError}>
                <Type as="p" id="profile-bookings-price-error" variant="caption" class="text-destructive-text">{props.basePriceError}</Type>
              </Show>
            </div>
          </div>

          <div class="flex items-center justify-between gap-4 border-t border-border-soft pt-4">
            <Type variant="caption">{copy().autosaveNote}</Type>
            <Show when={props.saving}>
              <Type aria-live="polite" variant="caption">{copy().savingNote}</Type>
            </Show>
          </div>
          <div class="flex items-center justify-between gap-4 border-t border-border-soft pt-4">
            <div class="flex min-w-0 flex-col gap-1">
              <Type variant="label">{copy().bookableLabel}</Type>
              <Type variant="caption">
                {props.payoutReady ? (props.bookable ? copy().bookableOnHint : copy().bookableOffHint) : copy().publishBlockedNote}
              </Type>
              <Show when={props.bookable && props.rules.length === 0}>
                <FormNote tone="warning">{copy().bookableNoAvailability}</FormNote>
              </Show>
            </div>
            <Switch
              aria-label={copy().bookableLabel}
              checked={props.bookable}
              disabled={Boolean(props.toggling) || !props.payoutReady}
              onChange={() => props.onToggleBookable?.()}
            />
          </div>
        </SectionCard>
      </SettingsSection>

      <SettingsSection id="profile-bookings-weekly" title={copy().weeklyAvailabilityTitle}>
        <SectionCard>
          <Show when={props.rules.length > 0} fallback={<Type variant="caption">{copy().noAvailability}</Type>}>
            <div class="flex flex-col gap-2">
              <For each={props.rules}>
                {(rule) => (
                  <ListRow
                    onRemove={props.onRulesChange ? () => props.onRulesChange?.(props.rules.filter((entry) => entry.id !== rule.id)) : undefined}
                    removeLabel={copy().remove}
                    removeName={rule.id}
                  >
                    {formatRuleSummary(rule)}
                  </ListRow>
                )}
              </For>
            </div>
          </Show>
          <div class="flex flex-col gap-3 rounded-lg border border-dashed border-border-soft p-3">
            <WeekdayPicker label={copy().weeklyAvailabilityTitle} onToggle={(day, checked) => setRuleWeekdays((current) => checked ? [...current, day] : current.filter((value) => value !== day))} selected={ruleWeekdays()} />
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label class="flex min-w-0 flex-1 flex-col gap-2"><Input aria-label={`${copy().weeklyAvailabilityTitle}: start`} onInput={(event) => setRuleStart(event.currentTarget.value)} type="time" value={ruleStart()} /></label>
              <Type class="shrink-0" variant="caption">{copy().rangeSeparator}</Type>
              <label class="flex min-w-0 flex-1 flex-col gap-2"><Input aria-label={`${copy().weeklyAvailabilityTitle}: end`} onInput={(event) => setRuleEnd(event.currentTarget.value)} type="time" value={ruleEnd()} /></label>
            </div>
            <Button data-profile-bookings-adder="weekly" disabled={busy() || ruleWeekdays().length === 0} onClick={addRule} type="button" variant="outline">{copy().addAvailability}</Button>
          </div>
        </SectionCard>
      </SettingsSection>

      <SettingsSection id="profile-bookings-pricing" title={copy().variablePricingTitle}>
        <SectionCard>
          <Show when={props.priceRules.length > 0} fallback={<Type variant="caption">{copy().noPriceRules}</Type>}>
            <div class="flex flex-col gap-2">
              <For each={props.priceRules}>
                {(rule) => (
                  <ListRow
                    onRemove={props.onPriceRulesChange ? () => props.onPriceRulesChange?.(props.priceRules.filter((entry) => entry.id !== rule.id)) : undefined}
                    removeLabel={copy().remove}
                    removeName={rule.id}
                  >
                    {formatPriceRuleSummary(rule, copy().allDays)}
                  </ListRow>
                )}
              </For>
            </div>
          </Show>
          <div class="flex flex-col gap-3 rounded-lg border border-dashed border-border-soft p-3">
            <WeekdayPicker label={copy().variablePricingTitle} onToggle={(day, checked) => setPriceWeekdays((current) => checked ? [...current, day] : current.filter((value) => value !== day))} selected={priceWeekdays()} />
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label class="flex min-w-0 flex-1 flex-col gap-2"><Input aria-label={`${copy().variablePricingTitle}: start`} onInput={(event) => setPriceStart(event.currentTarget.value)} type="time" value={priceStart()} /></label>
              <Type class="shrink-0" variant="caption">{copy().rangeSeparator}</Type>
              <label class="flex min-w-0 flex-1 flex-col gap-2"><Input aria-label={`${copy().variablePricingTitle}: end`} onInput={(event) => setPriceEnd(event.currentTarget.value)} type="time" value={priceEnd()} /></label>
              <label class="flex flex-col gap-2"><FormFieldLabel label={copy().basePriceLabel} /><Input aria-label={copy().basePriceLabel} min="0.01" onInput={(event) => setPriceRuleUsd(event.currentTarget.value)} step="0.01" type="number" value={priceRuleUsd()} /></label>
            </div>
            <Button data-profile-bookings-adder="pricing" disabled={busy() || priceWeekdays().length === 0} onClick={addPriceRule} type="button" variant="outline">{copy().addPriceRule}</Button>
          </div>
        </SectionCard>
      </SettingsSection>

      <SettingsSection id="profile-bookings-exceptions" title={copy().exceptionsTitle}>
        <SectionCard>
          <Show when={props.exceptions.length > 0} fallback={<Type variant="caption">{copy().noExceptions}</Type>}>
            <div class="flex flex-col gap-2">
              <For each={props.exceptions}>
                {(exception) => (
                  <ListRow
                    onRemove={props.onExceptionsChange ? () => props.onExceptionsChange?.(props.exceptions.filter((entry) => entry.id !== exception.id)) : undefined}
                    removeLabel={copy().remove}
                    removeName={exception.id}
                  >
                    {formatExceptionSummary(exception, localeTag(), { block: copy().exceptionBlock, open: copy().exceptionOpen })}
                  </ListRow>
                )}
              </For>
            </div>
          </Show>
          <div class="flex flex-col gap-3 rounded-lg border border-dashed border-border-soft p-3">
            <div class="flex flex-col gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr_8rem] sm:items-center">
              <label class="flex min-w-0 flex-col gap-2"><Input aria-label={`${copy().exceptionsTitle}: start`} onInput={(event) => setExceptionStart(event.currentTarget.value)} type="datetime-local" value={exceptionStart()} /></label>
              <Type class="shrink-0" variant="caption">{copy().rangeSeparator}</Type>
              <label class="flex min-w-0 flex-col gap-2"><Input aria-label={`${copy().exceptionsTitle}: end`} onInput={(event) => setExceptionEnd(event.currentTarget.value)} type="datetime-local" value={exceptionEnd()} /></label>
              <label class="flex flex-col gap-2"><select aria-label={copy().exceptionsTitle} class="h-11 rounded-full border border-border-soft bg-card px-4" onChange={(event) => setExceptionKind(parseExceptionKind(event.currentTarget.value))} value={exceptionKind()}><option value="block">{copy().exceptionBlock}</option><option value="open">{copy().exceptionOpen}</option></select></label>
            </div>
            <Button data-profile-bookings-adder="exceptions" disabled={busy() || !exceptionStart() || !exceptionEnd()} onClick={addException} type="button" variant="outline">{copy().addException}</Button>
          </div>
        </SectionCard>
      </SettingsSection>

      <SettingsSection id="profile-bookings-cancellation" title={copy().cancellationTitle}>
        <Type class="text-muted-foreground" variant="caption">{copy().cancellationCopy}</Type>
      </SettingsSection>
    </div>
  );
}

export type {
  AvailabilityExceptionDraft,
  AvailabilityRuleDraft,
  PriceRuleDraft,
  ProfileBookingsValues,
} from "./profile-bookings-section-model";
