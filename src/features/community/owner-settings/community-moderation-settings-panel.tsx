import { For, Show } from "solid-js";
import {
  Button,
  Card,
  FormNote,
  IconLock,
  Select,
  Spinner,
  Type,
  cn,
} from "@pirate/web-solid-ui";
import { CommunityModerationSaveFooter } from "../community-moderation-save-footer";
import {
  canActOnCommunityModeration,
  moderationCaseActionInput,
  moderationPolicyUpdateInput,
  type CommunityModerationCapabilities,
  type CommunityModerationCase,
  type CommunityModerationCaseAction,
  type CommunityModerationCaseActionInput,
  type CommunityModerationCaseDetail,
  type CommunityModerationCaseList,
  type CommunityModerationCaseView,
  type CommunityModerationPolicy,
  type CommunityModerationPolicyCategory,
  type CommunityModerationPolicyDecision,
  type CommunityModerationPolicyDecisions,
  type CommunityModerationPolicyUpdateInput,
} from "./community-moderation-settings-model";

const DECISIONS: ReadonlyArray<{ label: string; value: CommunityModerationPolicyDecision }> = [
  { label: "Allow", value: "permit" },
  { label: "Send to review", value: "review" },
  { label: "Block", value: "block" },
];

const DEFAULT_ACTION_LABELS = {
  approve_as_general: "Approve",
  approve_as_adult_18: "Approve as 18+",
  reject: "Reject",
  dismiss_report: "Dismiss report",
  hide: "Hide",
  raise_rating_to_adult_18: "Mark as 18+",
  restore: "Restore",
} satisfies Record<CommunityModerationCaseAction, string>;

function categoryLabel(category: string): string {
  return category.split("/").map((part) => part.replaceAll("-", " ")).join(" · ");
}

function decisionFromValue(value: string | null): CommunityModerationPolicyDecision | undefined {
  return DECISIONS.find((option) => option.value === value)?.value;
}

function isDestructiveAction(action: CommunityModerationCaseAction): boolean {
  return action === "reject" || action === "hide";
}

function caseCategorySummary(detail?: CommunityModerationCaseDetail): string {
  const value = (detail?.evidence.matched_categories ?? []).map(categoryLabel).join(", ");
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : "";
}

function caseViewLabel(view: CommunityModerationCaseView): string {
  return view === "open" ? "Needs review" : "Taken down";
}

function emptyCaseViewCopy(view: CommunityModerationCaseView): Readonly<{ body: string; title: string }> {
  return view === "open"
    ? { body: "New reports will appear here.", title: "Nothing needs review" }
    : { body: "Content you take down will appear here so it can be restored.", title: "Nothing has been taken down" };
}

function caseActionLabel(action: CommunityModerationCaseAction, status: CommunityModerationCase["target_status"]): string {
  if (status === "held") {
    if (action === "approve_as_general") return "Publish";
    if (action === "approve_as_adult_18") return "Publish as 18+";
    if (action === "reject") return "Don't publish";
  }
  return DEFAULT_ACTION_LABELS[action];
}

interface CommunityModerationPanelStateProps {
  capabilities: CommunityModerationCapabilities;
  errorMessage?: string;
  loading?: boolean;
  showHeading?: boolean;
}

export interface CommunityModerationQueuePanelProps extends CommunityModerationPanelStateProps {
  actionBusy?: Readonly<{ action: CommunityModerationCaseAction; caseRef: string }>;
  caseActionIdempotencyKey: (caseRef: string) => string;
  cases: CommunityModerationCaseList;
  caseView: CommunityModerationCaseView;
  details: ReadonlyArray<CommunityModerationCaseDetail>;
  onCaseAction?: (input: CommunityModerationCaseActionInput) => void;
  onCaseViewChange?: (view: CommunityModerationCaseView) => void;
}

export interface CommunityModerationPolicyPanelProps extends CommunityModerationPanelStateProps {
  onPolicyDecisionChange?: (category: CommunityModerationPolicyCategory, decision: CommunityModerationPolicyDecision) => void;
  onPolicySave?: (input: CommunityModerationPolicyUpdateInput) => void;
  policy: CommunityModerationPolicy;
  policyDecisions: CommunityModerationPolicyDecisions;
  policyDirty?: boolean;
  policySaving?: boolean;
}

function CaseCard(props: Pick<CommunityModerationQueuePanelProps, "actionBusy" | "capabilities" | "caseActionIdempotencyKey" | "onCaseAction"> & { detail?: CommunityModerationCaseDetail; item: CommunityModerationCase }) {
  const canAct = () => canActOnCommunityModeration(props.capabilities);
  const act = (action: CommunityModerationCaseAction) => {
    props.onCaseAction?.(moderationCaseActionInput({ action, case: props.item, idempotencyKey: props.caseActionIdempotencyKey(props.item.case_ref) }));
  };
  const textPreview = (): Extract<CommunityModerationCaseDetail["preview"], { kind: "text" }> | undefined => {
    const preview = props.detail?.preview;
    return preview?.kind === "text" ? preview : undefined;
  };
  const categorySummary = () => caseCategorySummary(props.detail);
  return (
    <Card class="flex flex-col gap-5 p-5 md:p-6">
      <Show when={categorySummary()}><Type as="p" class="text-muted-foreground" variant="caption">{categorySummary()}</Type></Show>
      <Show when={textPreview()} fallback={props.detail?.preview.kind === "locked"
        ? <div class="grid min-h-32 place-items-center rounded-[var(--radius-xl)] border border-border-soft bg-muted/30 p-5 text-center"><div><IconLock class="mx-auto mb-2 size-6" /><Type as="p" variant="body-strong">18+ preview locked</Type><Type as="p" class="mt-1 text-muted-foreground" variant="caption">This account cannot view adult-rated content.</Type></div></div>
        : <FormNote>Content preview unavailable.</FormNote>
      }>
        {(preview) => <div><Show when={preview().title}><Type as="h3" variant="h3">{preview().title}</Type></Show><Show when={preview().body}><Type as="p" class="mt-2 whitespace-pre-wrap" variant="body">{preview().body}</Type></Show></div>}
      </Show>
      <Show when={canAct()} fallback={<FormNote>View only. Moderation actions require the moderation.act capability.</FormNote>}>
        <div class="flex flex-wrap gap-2 border-t border-border-soft pt-5">
          <For each={props.item.permitted_actions}>{(action) => {
            const busy = () => props.actionBusy?.caseRef === props.item.case_ref && props.actionBusy.action === action;
            return <Button disabled={Boolean(props.actionBusy)} loading={busy()} onClick={() => act(action)} size="sm" variant={isDestructiveAction(action) ? "destructive" : "secondary"}>{caseActionLabel(action, props.item.target_status)}</Button>;
          }}</For>
        </div>
      </Show>
    </Card>
  );
}

function CaseQueue(props: CommunityModerationQueuePanelProps) {
  const detailFor = (caseRef: string) => props.details.find((detail) => detail.case.case_ref === caseRef);
  const emptyCopy = () => emptyCaseViewCopy(props.caseView);
  return (
    <section aria-label="Moderation cases" class="flex flex-col gap-4 pb-24 md:pb-0">
      <div class="flex items-center justify-between gap-4">
        <Show when={props.showHeading !== false}><Type as="h2" variant="h2">Moderation queue</Type></Show>
        <div class="flex rounded-[var(--radius-lg)] bg-muted p-1" role="group" aria-label="Case status">
          <For each={["open", "hidden"] as const}>{(view) => <button class={cn("cursor-pointer rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-semibold transition-colors", props.caseView === view ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")} onClick={() => props.onCaseViewChange?.(view)} type="button">{caseViewLabel(view)}</button>}</For>
        </div>
      </div>
      <Show when={props.cases.items.length > 0} fallback={<Card class="p-8 text-center"><Type as="p" variant="body-strong">{emptyCopy().title}</Type><Type as="p" class="mt-1 text-muted-foreground" variant="caption">{emptyCopy().body}</Type></Card>}>
        <div class="flex flex-col gap-4"><For each={props.cases.items}>{(item) => <CaseCard {...props} detail={detailFor(item.case_ref)} item={item} />}</For></div>
      </Show>
    </section>
  );
}

function PolicyEditor(props: Pick<CommunityModerationPolicyPanelProps, "capabilities" | "onPolicyDecisionChange" | "onPolicySave" | "policy" | "policyDecisions" | "policyDirty" | "policySaving">) {
  const canAct = () => canActOnCommunityModeration(props.capabilities);
  return (
    <section aria-label="Moderation policy" class="flex flex-col gap-4">
      <Card class="overflow-hidden">
        <div class="border-b border-border-soft p-5 md:p-6"><Type as="h3" variant="h3">Policy categories</Type><Type as="p" class="mt-1 text-muted-foreground" variant="body">Choose what is allowed, reviewed or blocked.</Type></div>
        <div class="divide-y divide-border-soft">
          <For each={props.policy.categories}>{(item) => (
            <div class="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_13rem] md:items-center md:px-6">
              <div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><Type as="p" class="capitalize" variant="body-strong">{categoryLabel(item.category)}</Type><Show when={item.locked}><span class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground"><IconLock class="size-3" /> Platform rule</span></Show></div><Type as="p" class="mt-1 text-muted-foreground" variant="caption">Applies to {item.input_types.join(" and ")} · allowed content is rated {item.permit_rating === "adult_18" ? "18+" : "general"}</Type></div>
              <Select
                aria-label={`${categoryLabel(item.category)} policy`}
                disabled={!canAct() || item.locked}
                onChange={(value) => { const decision = decisionFromValue(value); if (decision) props.onPolicyDecisionChange?.(item.category, decision); }}
                optionLabel={(option) => option.label}
                options={[...DECISIONS]}
                optionValue={(option) => option.value}
                value={item.locked ? item.effective_decision : props.policyDecisions[item.category]}
              />
            </div>
          )}</For>
        </div>
      </Card>
      <Show when={canAct()} fallback={<FormNote>View only. Policy changes require the moderation.act capability.</FormNote>}>
        <CommunityModerationSaveFooter
          disabled={!props.policyDirty}
          loading={props.policySaving}
          onSave={() => props.onPolicySave?.(moderationPolicyUpdateInput({ decisions: props.policyDecisions, policy: props.policy }))}
          primaryLabel="Save policy"
          secondaryAction={<Type as="p" class="text-muted-foreground" variant="caption">Changes apply going forward; existing content is not reviewed again. Platform rules cannot be loosened.</Type>}
        />
      </Show>
    </section>
  );
}

export function CommunityModerationQueuePanel(props: CommunityModerationQueuePanelProps) {
  return (
    <div class="flex flex-col gap-5">
      <Show when={!props.errorMessage} fallback={<Card class="p-6"><FormNote tone="destructive">{props.errorMessage}</FormNote></Card>}>
        <Show when={!props.loading} fallback={<Card class="grid min-h-64 place-items-center" role="status"><div class="flex items-center gap-3"><Spinner class="size-5" /><Type variant="body">Loading queue…</Type></div></Card>}>
          <CaseQueue {...props} />
        </Show>
      </Show>
    </div>
  );
}

export function CommunityModerationPolicyPanel(props: CommunityModerationPolicyPanelProps) {
  return (
    <div class="flex flex-col gap-5">
      <Show when={props.showHeading !== false}><div><Type as="h2" variant="h2">Content policy</Type><Type as="p" class="mt-1 text-muted-foreground" variant="body">Set what is allowed, reviewed or blocked in this community.</Type></div></Show>
      <Show when={!props.errorMessage} fallback={<Card class="p-6"><FormNote tone="destructive">{props.errorMessage}</FormNote></Card>}>
        <Show when={!props.loading} fallback={<Card class="grid min-h-64 place-items-center" role="status"><div class="flex items-center gap-3"><Spinner class="size-5" /><Type variant="body">Loading policy…</Type></div></Card>}>
          <PolicyEditor {...props} />
        </Show>
      </Show>
    </div>
  );
}
