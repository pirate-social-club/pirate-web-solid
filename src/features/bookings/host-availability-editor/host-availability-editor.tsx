import { For, Show } from "solid-js";

import { Button, Card, CardContent, IconPlus, IconX, Input, Type, cn } from "../../../design-system";
import {
  WEEKDAY_LABELS,
  clampPriceCents,
  clampSlotDurationMinutes,
  localUtcInput,
  nextDraftId,
  toggleDay,
  utcFromLocalInput,
  type AvailabilityExceptionDraft,
  type AvailabilityRuleDraft,
  type PriceRuleDraft,
} from "./host-availability-editor-model";

export interface HostAvailabilityEditorProps {
  rules: AvailabilityRuleDraft[];
  priceRules: PriceRuleDraft[];
  exceptions: AvailabilityExceptionDraft[];
  onRulesChange?: (rules: AvailabilityRuleDraft[]) => void;
  onPriceRulesChange?: (rules: PriceRuleDraft[]) => void;
  onExceptionsChange?: (exceptions: AvailabilityExceptionDraft[]) => void;
  class?: string;
}

function parseExceptionKind(value: string): "block" | "open" {
  return value === "open" ? "open" : "block";
}

export function HostAvailabilityEditor(props: HostAvailabilityEditorProps) {
  const updateRule = (id: string, patch: Partial<AvailabilityRuleDraft>) => props.onRulesChange?.(props.rules.map((rule) => rule.id === id ? { ...rule, ...patch } : rule));
  const updatePrice = (id: string, patch: Partial<PriceRuleDraft>) => props.onPriceRulesChange?.(props.priceRules.map((rule) => rule.id === id ? { ...rule, ...patch } : rule));
  const updateException = (id: string, patch: Partial<AvailabilityExceptionDraft>) => props.onExceptionsChange?.(props.exceptions.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  const addRule = () => props.onRulesChange?.([...props.rules, { id: nextDraftId("rule", props.rules.map((rule) => rule.id)), byWeekday: [1, 2, 3, 4, 5], startLocal: "09:00", endLocal: "17:00", slotDurationMinutes: 30 }]);
  const addPrice = () => props.onPriceRulesChange?.([...props.priceRules, { id: nextDraftId("price", props.priceRules.map((rule) => rule.id)), matchWeekday: [1, 2, 3, 4, 5], startLocal: "09:00", endLocal: "12:00", priceCents: 6000 }]);
  const addException = () => props.onExceptionsChange?.([...props.exceptions, { id: nextDraftId("exc", props.exceptions.map((entry) => entry.id)), kind: "block", startUtc: "2026-07-04T00:00:00Z", endUtc: "2026-07-04T23:59:59Z" }]);

  return (
    <div class={cn("flex flex-col gap-6", props.class)} data-availability-editor>
      <Card><CardContent class="flex flex-col gap-4 p-6">
        <div class="flex items-center justify-between"><Type as="h2" variant="h3">Recurring availability</Type><Button aria-label="Add recurring rule" onClick={addRule} size="icon" variant="secondary"><IconPlus aria-hidden="true" /></Button></div>
        <Show when={props.rules.length > 0} fallback={<Type variant="caption">No recurring rules yet.</Type>}>
          <For each={props.rules}>{(rule) => <div class="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border-soft p-4">
            <div class="flex items-center justify-between"><Type variant="label">Rule</Type><Button aria-label={`Remove rule ${rule.id}`} onClick={() => props.onRulesChange?.(props.rules.filter((entry) => entry.id !== rule.id))} size="icon" variant="ghost"><IconX aria-hidden="true" /></Button></div>
            <div class="flex flex-wrap gap-2" role="group" aria-label="Days of week"><For each={WEEKDAY_LABELS}>{(label, day) => <button aria-label={`${label} availability`} aria-pressed={rule.byWeekday.includes(day()) ? "true" : "false"} class={cn("size-11 rounded-full border", rule.byWeekday.includes(day()) ? "border-primary bg-primary text-primary-foreground" : "border-border-soft bg-card")} onClick={() => updateRule(rule.id, { byWeekday: toggleDay(rule.byWeekday, day()) })} type="button"><Type as="span" variant="caption" class={rule.byWeekday.includes(day()) ? "text-primary-foreground" : undefined}>{label.slice(0, 1)}</Type></button>}</For></div>
            <div class="grid gap-3 sm:grid-cols-3">
              <label class="flex flex-col gap-1"><Type variant="caption">Start</Type><Input aria-label={`Start time for ${rule.id}`} onInput={(event) => updateRule(rule.id, { startLocal: event.currentTarget.value })} type="time" value={rule.startLocal} /></label>
              <label class="flex flex-col gap-1"><Type variant="caption">End</Type><Input aria-label={`End time for ${rule.id}`} onInput={(event) => updateRule(rule.id, { endLocal: event.currentTarget.value })} type="time" value={rule.endLocal} /></label>
              <label class="flex flex-col gap-1"><Type variant="caption">Slot length (min)</Type><Input aria-label={`Slot length for ${rule.id}`} min="5" onInput={(event) => updateRule(rule.id, { slotDurationMinutes: clampSlotDurationMinutes(Number(event.currentTarget.value)) })} type="number" value={rule.slotDurationMinutes} /></label>
            </div>
          </div>}</For>
        </Show>
      </CardContent></Card>

      <Card><CardContent class="flex flex-col gap-4 p-6">
        <div class="flex items-center justify-between"><Type as="h2" variant="h3">Variable pricing</Type><Button aria-label="Add price rule" onClick={addPrice} size="icon" variant="secondary"><IconPlus aria-hidden="true" /></Button></div>
        <Show when={props.priceRules.length > 0} fallback={<Type variant="caption">No variable pricing — base price applies to all slots.</Type>}>
          <For each={props.priceRules}>{(rule) => <div class="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border-soft p-4">
            <div class="flex items-center justify-between"><Type variant="label">Price rule</Type><Button aria-label={`Remove price rule ${rule.id}`} onClick={() => props.onPriceRulesChange?.(props.priceRules.filter((entry) => entry.id !== rule.id))} size="icon" variant="ghost"><IconX aria-hidden="true" /></Button></div>
            <div class="grid gap-3 sm:grid-cols-3"><label class="flex flex-col gap-1"><Type variant="caption">Start</Type><Input aria-label={`Price start for ${rule.id}`} onInput={(event) => updatePrice(rule.id, { startLocal: event.currentTarget.value })} type="time" value={rule.startLocal} /></label><label class="flex flex-col gap-1"><Type variant="caption">End</Type><Input aria-label={`Price end for ${rule.id}`} onInput={(event) => updatePrice(rule.id, { endLocal: event.currentTarget.value })} type="time" value={rule.endLocal} /></label><label class="flex flex-col gap-1"><Type variant="caption">Price (cents)</Type><Input aria-label={`Price cents for ${rule.id}`} min="1" onInput={(event) => updatePrice(rule.id, { priceCents: clampPriceCents(Number(event.currentTarget.value)) })} type="number" value={rule.priceCents} /></label></div>
          </div>}</For>
        </Show>
      </CardContent></Card>

      <Card><CardContent class="flex flex-col gap-4 p-6">
        <div class="flex items-center justify-between"><Type as="h2" variant="h3">One-off exceptions</Type><Button aria-label="Add availability exception" onClick={addException} size="icon" variant="secondary"><IconPlus aria-hidden="true" /></Button></div>
        <Show when={props.exceptions.length > 0} fallback={<Type variant="caption">No exceptions — recurring rules apply as-is.</Type>}>
          <For each={props.exceptions}>{(entry) => <div class="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border-soft p-4"><div class="flex items-center justify-between"><Type variant="label">{entry.kind === "block" ? "Block" : "Open window"}</Type><Button aria-label={`Remove exception ${entry.id}`} onClick={() => props.onExceptionsChange?.(props.exceptions.filter((candidate) => candidate.id !== entry.id))} size="icon" variant="ghost"><IconX aria-hidden="true" /></Button></div><div class="grid gap-3 sm:grid-cols-3"><label class="flex flex-col gap-1"><Type variant="caption">Start (UTC)</Type><Input aria-label={`Exception start for ${entry.id}`} onInput={(event) => updateException(entry.id, { startUtc: utcFromLocalInput(event.currentTarget.value) })} type="datetime-local" value={localUtcInput(entry.startUtc)} /></label><label class="flex flex-col gap-1"><Type variant="caption">End (UTC)</Type><Input aria-label={`Exception end for ${entry.id}`} onInput={(event) => updateException(entry.id, { endUtc: utcFromLocalInput(event.currentTarget.value) })} type="datetime-local" value={localUtcInput(entry.endUtc)} /></label><label class="flex flex-col gap-1"><Type variant="caption">Type</Type><select aria-label={`Exception type for ${entry.id}`} class="h-11 rounded-full border border-border-soft bg-card px-4" onChange={(event) => updateException(entry.id, { kind: parseExceptionKind(event.currentTarget.value) })} value={entry.kind}><option value="block">Block</option><option value="open">Open</option></select></label></div></div>}</For>
        </Show>
      </CardContent></Card>
    </div>
  );
}

export type { AvailabilityExceptionDraft, AvailabilityRuleDraft, PriceRuleDraft } from "./host-availability-editor-model";
