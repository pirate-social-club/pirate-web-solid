import { For, Match, Show, Switch } from "solid-js";

import {
  Button,
  cn,
  IconWarningCircle,
  Modal,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
  TextField,
  TextFieldInput,
  TextFieldLabel,
  Type,
} from "../../design-system";
import { RewardRadioCardGroup } from "./reward-radio-card-group";
import {
  activityCaption,
  activityIsChoosable,
  activityTitle,
  canRestartFunding,
  failureLine,
  failureTitle,
  kindBlurb,
  kindTitle,
  type BoostActivity,
  type BoostKind,
  type BoostState,
} from "./boost-song-model";

export interface BoostSongSheetProps {
  readonly open: boolean;
  readonly state: BoostState;
  readonly onOpenChange: (open: boolean) => void;
  readonly onKindChange: (kind: BoostKind) => void;
  readonly onActivityChange: (activity: BoostActivity) => void;
  readonly onBudgetChange: (value: string) => void;
  readonly onRewardChange: (value: string) => void;
  readonly onReview: () => void;
  readonly onConfirm: () => void;
  readonly onBack: () => void;
  readonly onRestart: () => void;
  readonly onReconcile: () => void;
}

const ACTIVITY_OPTIONS: readonly BoostActivity[] = ["karaoke", "study", "either"];
const KIND_OPTIONS: readonly BoostKind[] = ["asset_bonus", "megapot_pool"];

function SummaryRow(props: { readonly label: string; readonly value: string }) {
  return (
    <div class="flex items-center justify-between gap-4 border-b border-border-soft py-3 last:border-b-0">
      <Type as="span" class="text-muted-foreground" variant="body">{props.label}</Type>
      <Type as="span" variant="body-strong">{props.value}</Type>
    </div>
  );
}

function AmountField(props: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly invalid?: boolean;
  readonly onChange: (value: string) => void;
}) {
  return (
    <TextField value={props.value} onChange={props.onChange}>
      <TextFieldLabel class="mb-2 block text-muted-foreground">{props.label}</TextFieldLabel>
      <div class="relative">
        <span class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
        <TextFieldInput class={cn("pl-8", props.invalid && "border-destructive")} id={props.id} />
      </div>
    </TextField>
  );
}

function Problem(props: { readonly message: string }) {
  return (
    <div class="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <IconWarningCircle class="mt-0.5 size-5 shrink-0 text-destructive" />
      <Type as="p" class="text-destructive" variant="body">{props.message}</Type>
    </div>
  );
}

/**
 * Create or fund a bounty on a song, ported from the legacy BoostCampaignSheet.
 * Bottom sheet on mobile, centred dialog above md. Every state is injected;
 * signing and recovery live in the funding controller under src/api.
 */
export function BoostSongSheet(props: BoostSongSheetProps) {
  return (
    <Modal open={props.open} onOpenChange={props.onOpenChange}>
      <ModalContent
        class="flex max-h-[88dvh] w-full flex-col overflow-y-auto px-5 pb-5 pt-4 md:w-[min(100%-2rem,36rem)] md:max-w-[36rem] md:px-7 md:pb-7 md:pt-7"
        mobileSide="bottom"
      >
        <ModalHeader class="text-start">
          <ModalTitle>{"Create a bounty"}</ModalTitle>
          <ModalDescription class="sr-only">
            Fund a bounty for people who practice this song.
          </ModalDescription>
        </ModalHeader>

        <Switch>
          <Match when={props.state.step === "compose" && props.state}>
            {(state) => (
              <div class="mt-5 space-y-4">
                <RewardRadioCardGroup
                  descriptions={kindBlurb}
                  label="Reward type"
                  labels={kindTitle}
                  options={KIND_OPTIONS}
                  value={state().draft.kind}
                  onChange={props.onKindChange}
                />
                <Show when={activityIsChoosable(state().draft.kind)}>
                  <RewardRadioCardGroup
                    label="People earn by"
                    labels={activityTitle}
                    options={ACTIVITY_OPTIONS}
                    value={state().draft.activity}
                    onChange={props.onActivityChange}
                  />
                </Show>
                <Show when={state().draft.rewardPerClaimLabel !== undefined}>
                  <AmountField
                    id="boost-reward"
                    label="Each person gets"
                    value={state().draft.rewardPerClaimLabel ?? ""}
                    onChange={props.onRewardChange}
                  />
                </Show>
                <div>
                  <AmountField
                    id="boost-budget"
                    label="Total budget"
                    value={state().draft.budgetLabel}
                    invalid={state().problem !== undefined}
                    onChange={props.onBudgetChange}
                  />
                  <Show when={state().presets.length > 0}>
                    <div class="mt-2 flex flex-wrap gap-2">
                      <For each={state().presets}>
                        {(preset) => (
                          <Button
                            class="h-9"
                            variant={preset === state().draft.budgetLabel ? "secondary" : "outline"}
                            onClick={() => props.onBudgetChange(preset)}
                          >
                            ${preset}
                          </Button>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
                <Show
                  when={state().problem}
                  fallback={
                    <Type as="p" class="text-muted-foreground" variant="caption">
                      {activityCaption(state().draft.kind, state().draft.activity)} You pay $
                      {state().draft.budgetLabel} now. Terms lock when the reward is created. Unspent funds are
                      refunded when the bounty ends.
                    </Type>
                  }
                >
                  {(problem) => <Problem message={problem()} />}
                </Show>
                <Button disabled={state().problem !== undefined} onClick={props.onReview}>
                  Review
                </Button>
              </div>
            )}
          </Match>

          <Match when={props.state.step === "quote" && props.state}>
            {(state) => (
              <div class="mt-5 space-y-4">
                <div class="rounded-lg border border-border-soft px-4">
                  <SummaryRow label="People earn by" value={activityTitle[state().quote.activity]} />
                  <SummaryRow label="Bounty" value={state().quote.rewardLabel} />
                  <SummaryRow label="Total" value={state().quote.budgetLabel} />
                  <SummaryRow label="Paying from" value={state().quote.senderLabel} />
                  <SummaryRow label="Network" value={state().quote.networkLabel} />
                  <SummaryRow label="Network fee" value={state().quote.feeLabel} />
                </div>
                <Type as="p" class="text-muted-foreground" variant="caption">
                  Your wallet signs this without another prompt, so check the amount and address above.
                </Type>
                <Button onClick={props.onConfirm}>Pay {state().quote.budgetLabel}</Button>
                <Button variant="ghost" onClick={props.onBack}>Back</Button>
              </div>
            )}
          </Match>

          <Match when={props.state.step === "confirming"}>
            <Type as="p" class="mt-5 text-muted-foreground" variant="body">
              Sending the reviewed transfer.
            </Type>
          </Match>

          <Match when={props.state.step === "awaiting_finality" && props.state}>
            {(state) => (
              <div class="mt-5 space-y-2">
                <Type as="p" variant="body">Transfer submitted. Waiting for confirmation — you can close this.</Type>
                <Show when={state().transactionHash}>
                  {(hash) => (
                    <Type as="p" class="break-all text-muted-foreground" variant="caption">{hash()}</Type>
                  )}
                </Show>
              </div>
            )}
          </Match>

          <Match when={props.state.step === "active" && props.state}>
            {(state) => (
              <div class="mt-5 space-y-4">
                <div class="rounded-lg border border-border-soft px-4">
                  <SummaryRow label="Activity" value={activityTitle[state().live.activity]} />
                  <SummaryRow label="Bounty" value={state().live.rewardLabel} />
                  <SummaryRow label="Remaining" value={state().live.remainingLabel} />
                </div>
              </div>
            )}
          </Match>

          <Match when={props.state.step === "failed" && props.state}>
            {(state) => (
              <div class="mt-5 space-y-4">
                <Problem message={`${failureTitle(state().failure)}. ${failureLine(state().failure)}`} />
                <Show when={state().transactionHash}>
                  {(hash) => (
                    <Type as="p" class="break-all text-muted-foreground" variant="caption">{hash()}</Type>
                  )}
                </Show>
                <Show
                  when={canRestartFunding(state().failure)}
                  fallback={
                    <Show
                      when={
                        state().failure === "recovery_unavailable"
                        || state().failure === "recovery_corrupt"
                      }
                    >
                      <Button variant="outline" onClick={props.onReconcile}>Enter hash</Button>
                    </Show>
                  }
                >
                  <Button onClick={props.onRestart}>Try again</Button>
                </Show>
              </div>
            )}
          </Match>
        </Switch>
      </ModalContent>
    </Modal>
  );
}
