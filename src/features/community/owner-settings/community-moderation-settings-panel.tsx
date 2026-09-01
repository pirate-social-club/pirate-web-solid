import { For, Show } from "solid-js";
import {
  Button,
  Card,
  FlatTabBar,
  FlatTabButton,
  FormNote,
  IconFileText,
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
  type CommunityModerationCaseAction,
  type CommunityModerationCaseActionInput,
  type CommunityModerationCaseDetail,
  type CommunityModerationCaseList,
  type CommunityModerationCaseView,
  type CommunityModerationPane,
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

const ACTION_LABELS = {
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

export interface CommunityModerationSettingsPanelProps {
  actionBusy?: CommunityModerationCaseAction;
  capabilities: CommunityModerationCapabilities;
  caseActionIdempotencyKey: string;
  cases: CommunityModerationCaseList;
  caseView: CommunityModerationCaseView;
  detail?: CommunityModerationCaseDetail;
  errorMessage?: string;
  loading?: boolean;
  onCaseAction?: (input: CommunityModerationCaseActionInput) => void;
  onCaseSelect?: (caseRef: string) => void;
  onCaseViewChange?: (view: CommunityModerationCaseView) => void;
  onPaneChange?: (pane: CommunityModerationPane) => void;
  onPolicyDecisionChange?: (category: CommunityModerationPolicyCategory, decision: CommunityModerationPolicyDecision) => void;
  onPolicySave?: (input: CommunityModerationPolicyUpdateInput) => void;
  pane: CommunityModerationPane;
  policy: CommunityModerationPolicy;
  policyDecisions: CommunityModerationPolicyDecisions;
  policyDirty?: boolean;
  policySaving?: boolean;
}

function CaseQueue(props: Pick<CommunityModerationSettingsPanelProps, "actionBusy" | "capabilities" | "caseActionIdempotencyKey" | "cases" | "caseView" | "detail" | "onCaseAction" | "onCaseSelect" | "onCaseViewChange">) {
  return (
    <section aria-label="Moderation cases" class="grid gap-4 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.4fr)]">
      <Card class="overflow-hidden">
        <div class="flex items-center justify-between gap-4 border-b border-border-soft p-4">
          <Type as="h3" variant="h3">Cases</Type>
          <div class="flex rounded-[var(--radius-lg)] bg-muted p-1" role="group" aria-label="Case status">
            <For each={["open", "hidden"] as const}>
              {(view) => (
                <button
                  class={cn("cursor-pointer rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-semibold capitalize transition-colors", props.caseView === view ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  onClick={() => props.onCaseViewChange?.(view)}
                  type="button"
                >{view}</button>
              )}
            </For>
          </div>
        </div>
        <Show when={props.cases.items.length > 0} fallback={<div class="p-8 text-center"><Type as="p" variant="body-strong">No {props.caseView} cases</Type><Type as="p" class="mt-1 text-muted-foreground" variant="caption">New reports and automated holds will appear here.</Type></div>}>
          <ul class="divide-y divide-border-soft">
            <For each={props.cases.items}>{(item) => (
              <li>
                <button
                  aria-current={props.detail?.case.case_ref === item.case_ref ? "true" : undefined}
                  class={cn("w-full cursor-pointer p-4 text-left transition-colors hover:bg-muted/60", props.detail?.case.case_ref === item.case_ref && "bg-primary-subtle")}
                  onClick={() => props.onCaseSelect?.(item.case_ref)}
                  type="button"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0"><Type as="p" class="truncate" variant="body-strong">{item.target_type.replaceAll("_", " ")}</Type><Type as="p" class="truncate text-muted-foreground" variant="caption">{item.source.replaceAll("_", " ")} · {item.author_persona_id}</Type></div>
                    <span class="rounded-full bg-muted px-2 py-1 text-xs font-semibold capitalize text-muted-foreground">{item.target_status}</span>
                  </div>
                </button>
              </li>
            )}</For>
          </ul>
        </Show>
      </Card>
      <CaseDetail {...props} />
    </section>
  );
}

function CaseDetail(props: Pick<CommunityModerationSettingsPanelProps, "actionBusy" | "capabilities" | "caseActionIdempotencyKey" | "detail" | "onCaseAction">) {
  const canAct = () => canActOnCommunityModeration(props.capabilities);
  const act = (action: CommunityModerationCaseAction) => {
    if (!props.detail) return;
    props.onCaseAction?.(moderationCaseActionInput({ action, case: props.detail.case, idempotencyKey: props.caseActionIdempotencyKey }));
  };
  return (
    <Card class="min-h-80 p-5 md:p-6">
      <Show when={props.detail} fallback={<div class="grid min-h-64 place-items-center text-center text-muted-foreground"><div><IconFileText class="mx-auto mb-3 size-7" /><Type as="p" variant="body">Select a case to review it.</Type></div></div>}>
        {(detail) => {
          const textPreview = (): Extract<CommunityModerationCaseDetail["preview"], { kind: "text" }> | undefined => {
            const preview = detail().preview;
            return preview.kind === "text" ? preview : undefined;
          };
          return <div class="flex h-full flex-col gap-5">
          <div><Type as="p" class="text-muted-foreground" variant="caption">{detail().case.case_ref}</Type><Type as="h3" class="mt-1" variant="h3">Review {detail().case.target_type.replaceAll("_", " ")}</Type></div>
          <Show when={textPreview()} fallback={
            <div class="grid min-h-36 place-items-center rounded-[var(--radius-xl)] border border-border-soft bg-muted/30 p-5 text-center"><div><IconLock class="mx-auto mb-2 size-6" /><Type as="p" variant="body-strong">18+ preview locked</Type><Type as="p" class="mt-1 text-muted-foreground" variant="caption">This account cannot view adult-rated content.</Type></div></div>
          }>
            {(preview) =>
              <div class="rounded-[var(--radius-xl)] border border-border-soft bg-muted/30 p-4">
                <Show when={preview().title}><Type as="p" variant="body-strong">{preview().title}</Type></Show>
                <Type as="p" class="mt-2 whitespace-pre-wrap" variant="body">{preview().body}</Type>
              </div>
            }
          </Show>
          <div><Type as="p" variant="label">Matched policy</Type><div class="mt-2 flex flex-wrap gap-2"><For each={detail().evidence.matched_categories}>{(category) => <span class="rounded-full bg-warning-subtle px-2.5 py-1 text-sm font-medium">{categoryLabel(category)}</span>}</For></div></div>
          <Show when={canAct()} fallback={<FormNote>View only. Moderation actions require the moderation.act capability.</FormNote>}>
            <div class="mt-auto flex flex-wrap gap-2 border-t border-border-soft pt-5">
              <For each={detail().case.permitted_actions}>{(action) => <Button disabled={Boolean(props.actionBusy)} loading={props.actionBusy === action} onClick={() => act(action)} size="sm" variant={isDestructiveAction(action) ? "destructive" : "secondary"}>{ACTION_LABELS[action]}</Button>}</For>
            </div>
          </Show>
        </div>}
        }
      </Show>
    </Card>
  );
}

function PolicyEditor(props: Pick<CommunityModerationSettingsPanelProps, "capabilities" | "onPolicyDecisionChange" | "onPolicySave" | "policy" | "policyDecisions" | "policyDirty" | "policySaving">) {
  const canAct = () => canActOnCommunityModeration(props.capabilities);
  return (
    <section aria-label="Moderation policy" class="flex flex-col gap-4">
      <Card class="overflow-hidden">
        <div class="border-b border-border-soft p-5 md:p-6"><Type as="h3" variant="h3">Content policy</Type><Type as="p" class="mt-1 text-muted-foreground" variant="body">Choose what is allowed, reviewed, or blocked in this community.</Type></div>
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

export function CommunityModerationSettingsPanel(props: CommunityModerationSettingsPanelProps) {
  return (
    <div class="flex flex-col gap-5">
      <div><Type as="h2" variant="h2">Moderation</Type><Type as="p" class="mt-1 text-muted-foreground" variant="body">Review reported content and set the community policy.</Type></div>
      <FlatTabBar columns={2}>
        <FlatTabButton active={props.pane === "cases"} onClick={() => props.onPaneChange?.("cases")}>Cases</FlatTabButton>
        <FlatTabButton active={props.pane === "policy"} onClick={() => props.onPaneChange?.("policy")}>Policy</FlatTabButton>
      </FlatTabBar>
      <Show when={!props.errorMessage} fallback={<Card class="p-6"><FormNote tone="destructive">{props.errorMessage}</FormNote></Card>}>
        <Show when={!props.loading} fallback={<Card class="grid min-h-64 place-items-center" role="status"><div class="flex items-center gap-3"><Spinner class="size-5" /><Type variant="body">Loading moderation…</Type></div></Card>}>
          <Show when={props.pane === "cases"} fallback={<PolicyEditor {...props} />}><CaseQueue {...props} /></Show>
        </Show>
      </Show>
    </div>
  );
}
