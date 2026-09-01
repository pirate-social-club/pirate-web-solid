import { For, Show, createSignal, type Accessor } from "solid-js";

import {
  Button,
  FormFieldLabel,
  IconPencil,
  IconPlus,
  IconTrash,
  Input,
  Textarea,
  Type,
  cn,
} from "@pirate/web-solid-ui";
import { getLocaleMessages } from "../../../locales";
import type { GeneratedLocaleCatalogs } from "../../../locales/generated";
import { useUiLocale } from "../../../lib/ui-locale";
import { CommunityModerationSaveFooter } from "../community-moderation-save-footer";
import {
  createEmptyRuleDraft,
  hasRuleTitle,
  isBlankNewRule,
  type RuleDraft,
} from "./community-rules-editor-model";

type RulesCopy = {
  [Key in keyof GeneratedLocaleCatalogs["en"]["routes"]["moderation"]["rules"]]: string;
};

export type { RuleDraft } from "./community-rules-editor-model";
export { createEmptyRuleDraft, hasRuleTitle, isBlankNewRule, nextRuleDraftId } from "./community-rules-editor-model";

export interface CommunityRulesEditorPageProps {
  class?: string;
  rules: RuleDraft[];
  onRulesChange?: (rules: RuleDraft[]) => void;
  onSave?: () => void;
  saveDisabled?: boolean;
  showHeading?: boolean;
  saveLoading?: boolean;
}

function RuleRow(props: {
  index: number;
  onEdit: () => void;
  onRemove: () => void;
  rule: Accessor<RuleDraft>;
}) {
  return (
    <div class="flex items-start gap-4 rounded-[var(--radius-xl)] border border-border-soft bg-card px-4 py-3" data-community-rule-id={props.rule().id}>
      <span class="shrink-0 pt-1 tabular-nums text-muted-foreground/60">{props.index + 1}</span>
      <div class="min-w-0 flex-1">
        <Type as="div" variant="body-strong" class="truncate">
          {props.rule().title.trim() || "Untitled rule"}
        </Type>
        <Show when={props.rule().body.trim()}>
          <Type as="div" variant="caption" class="mt-1 line-clamp-2 text-muted-foreground">
            {props.rule().body}
          </Type>
        </Show>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <Button aria-label="Edit rule" class="size-9" id={`${props.rule().id}-edit`} onClick={props.onEdit} size="icon" variant="ghost">
          <IconPencil class="size-5" />
        </Button>
        <Button aria-label="Delete rule" class="size-9" id={`${props.rule().id}-delete`} onClick={props.onRemove} size="icon" variant="ghost">
          <IconTrash class="size-5" />
        </Button>
      </div>
    </div>
  );
}

function RuleEditForm(props: {
  copy: () => RulesCopy;
  draft: Accessor<RuleDraft>;
  onCancel: () => void;
  onDraftChange: (patch: Partial<RuleDraft>) => void;
  onSave: () => void;
}) {
  const titleId = () => `${props.draft().id}-title`;
  const bodyId = () => `${props.draft().id}-body`;
  const reportReasonId = () => `${props.draft().id}-report-reason`;
  let titleInput: HTMLInputElement | undefined;
  if (typeof document !== "undefined") queueMicrotask(() => titleInput?.focus());
  return (
    <div class="space-y-5 rounded-[var(--radius-2_5xl)] border border-border-soft bg-card p-5">
      <div class="space-y-3">
        <FormFieldLabel htmlFor={titleId()} label={props.copy().namePlaceholder} required />
        <Input
          id={titleId()}
          onInput={(event) => props.onDraftChange({ title: event.currentTarget.value })}
          placeholder={props.copy().namePlaceholder}
          required
          ref={titleInput}
          size="lg"
          value={props.draft().title}
        />
        <Type as="div" variant="caption" class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <span>{props.copy().maxChars100}</span>
          <span>{props.draft().title.length}/100</span>
        </Type>
      </div>

      <div class="space-y-3">
        <FormFieldLabel htmlFor={bodyId()} label={props.copy().descriptionPlaceholder} />
        <Textarea
          id={bodyId()}
          class="min-h-36 rounded-[var(--radius-2_5xl)] px-5 py-4"
          onInput={(event) => props.onDraftChange({ body: event.currentTarget.value })}
          placeholder={props.copy().descriptionPlaceholder}
          value={props.draft().body}
        />
        <Type as="div" variant="caption" class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <span>{props.copy().maxChars500}</span>
          <span>{props.draft().body.length}/500</span>
        </Type>
      </div>

      <div class="space-y-3 pt-1">
        <div class="space-y-1">
          <Type as="div" variant="label">{props.copy().reportingTitle}</Type>
          <Type as="p" variant="caption">{props.copy().reportingDescription}</Type>
        </div>
        <FormFieldLabel htmlFor={reportReasonId()} label={props.copy().reportReasonPlaceholder} labelClass="sr-only" />
        <Input
          id={reportReasonId()}
          onInput={(event) => props.onDraftChange({ reportReason: event.currentTarget.value })}
          placeholder={props.copy().reportReasonPlaceholder}
          size="lg"
          value={props.draft().reportReason}
        />
        <Type as="div" variant="caption" class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <span>{props.copy().reportReasonHint}</span>
          <span>{props.draft().reportReason.length}/100</span>
        </Type>
      </div>

      <div class="flex items-center justify-end gap-3 pt-1">
        <Button onClick={props.onCancel} variant="ghost">Cancel</Button>
        <Button disabled={!hasRuleTitle(props.draft())} onClick={props.onSave}>Save rule</Button>
      </div>
    </div>
  );
}

export function CommunityRulesEditorPage(props: CommunityRulesEditorPageProps) {
  const locale = () => useUiLocale();
  const copy = () => getLocaleMessages(locale(), "routes").moderation.rules;
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const editingDraft = () => props.rules.find((rule) => rule.id === editingId()) ?? null;

  const focusAfterUpdate = (id: string) => {
    if (typeof document === "undefined") return;
    queueMicrotask(() => document.getElementById(id)?.focus());
  };

  const updateRule = (id: string, patch: Partial<RuleDraft>) => {
    props.onRulesChange?.(props.rules.map((rule) => rule.id === id ? { ...rule, ...patch } : rule));
  };

  const removeRule = (id: string) => {
    if (editingId() === id) setEditingId(null);
    props.onRulesChange?.(props.rules.filter((rule) => rule.id !== id));
  };

  const addRule = () => {
    const draft = createEmptyRuleDraft(props.rules.map((rule) => rule.id));
    props.onRulesChange?.([...props.rules, draft]);
    setEditingId(draft.id);
  };

  const commitEdit = () => {
    const draft = editingDraft();
    if (!draft || !hasRuleTitle(draft)) return;
    setEditingId(null);
    focusAfterUpdate(`${draft.id}-edit`);
  };

  const cancelEdit = () => {
    const draft = editingDraft();
    if (!draft) return;
    const removeDraft = isBlankNewRule(draft);
    if (removeDraft) props.onRulesChange?.(props.rules.filter((rule) => rule.id !== draft.id));
    setEditingId(null);
    focusAfterUpdate(removeDraft ? "community-rules-add" : `${draft.id}-edit`);
  };

  return (
    <section class={cn("mx-auto flex w-full max-w-5xl flex-col gap-6 md:gap-8", props.class)} data-community-rules-editor>
      <div class="flex items-center justify-between gap-4">
        <Show when={props.showHeading !== false}><div class="min-w-0 space-y-1">
            <Type as="h1" responsiveSize="desktop4xl" variant="h1">{copy().title}</Type>
            <Type as="p" variant="caption">{copy().description}</Type>
          </div></Show>
        <Button class="shrink-0" id="community-rules-add" onClick={addRule} variant="secondary">
          <IconPlus class="size-5" />
          {copy().addRule}
        </Button>
      </div>

      <div class="flex flex-col gap-3">
        <For each={props.rules} keyed={false}>
          {(rule, index) => (
            <Show
              when={rule().id !== editingId()}
              fallback={
                <RuleEditForm
                  copy={copy}
                  draft={() => rule()}
                  onCancel={cancelEdit}
                  onDraftChange={(patch) => updateRule(rule().id, patch)}
                  onSave={commitEdit}
                />
              }
            >
              <RuleRow index={index} onEdit={() => setEditingId(rule().id)} onRemove={() => removeRule(rule().id)} rule={rule} />
            </Show>
          )}
        </For>

        <Show when={props.rules.length === 0}>
          <Type as="div" variant="caption" class="rounded-[var(--radius-xl)] border border-dashed border-border-soft bg-card px-5 py-8 text-center">
            {copy().emptyState}
          </Type>
        </Show>
      </div>

      <CommunityModerationSaveFooter
        disabled={props.saveDisabled}
        loading={props.saveLoading}
        onSave={props.onSave}
      />
    </section>
  );
}
