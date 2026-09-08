import { For, Match, Show, Switch } from "solid-js";

import {
  Button,
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  OptionCard,
  OptionCardGroup,
  TextField,
  TextFieldInput,
  TextFieldLabel,
  Type,
} from "../../design-system";
import {
  activityIsChoosable,
  activityLabel,
  canRestartFunding,
  failureLine,
  failureTitle,
  kindTitle,
  type BoostActivity,
  type BoostState,
} from "./boost-song-model";

export interface BoostSongSheetProps {
  readonly open: boolean;
  readonly state: BoostState;
  readonly songTitle: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onBudgetChange: (value: string) => void;
  readonly onRewardChange: (value: string) => void;
  readonly onActivityChange: (activity: BoostActivity) => void;
  /** compose → quote */
  readonly onReview: () => void;
  /** quote → confirming; hands off to the wallet. */
  readonly onFund: () => void;
  readonly onBack: () => void;
  /** Only offered when the failure proves nothing was broadcast. */
  readonly onRestart: () => void;
  /** Support-assisted hash entry. Authorizes nothing. */
  readonly onReconcile: () => void;
}

const stepCaption = {
  compose: "Step 1 of 3 · Set it up",
  quote: "Step 2 of 3 · Check it over",
  confirming: "Step 3 of 3 · Sending transfer",
  awaiting_finality: "Step 3 of 3 · Confirming",
  active: "Live",
  failed: "Couldn't fund",
} satisfies Record<BoostState["step"], string>;

export function BoostSongSheet(props: BoostSongSheetProps) {
  return (
    <Modal open={props.open} onOpenChange={props.onOpenChange}>
      <ModalContent class="max-w-md">
        <ModalHeader>
          <ModalTitle>Boost {props.songTitle}</ModalTitle>
          <ModalDescription>{stepCaption[props.state.step]}</ModalDescription>
        </ModalHeader>

        <Switch>
          <Match when={props.state.step === "compose" && props.state}>
            {(state) => (
              <>
                <div class="space-y-4">
                  <TextField value={state().draft.budgetLabel} onChange={props.onBudgetChange}>
                    <TextFieldLabel>You're putting in</TextFieldLabel>
                    <TextFieldInput />
                  </TextField>
                  <Show when={state().draft.rewardPerClaimLabel !== undefined}>
                    <TextField
                      value={state().draft.rewardPerClaimLabel ?? ""}
                      onChange={props.onRewardChange}
                    >
                      <TextFieldLabel>Each person gets</TextFieldLabel>
                      <TextFieldInput />
                    </TextField>
                  </Show>
                  <Show
                    when={activityIsChoosable(state().draft.kind)}
                    fallback={
                      <Type as="p" class="text-muted-foreground" variant="caption">
                        {activityLabel.either} both count.
                      </Type>
                    }
                  >
                    <OptionCardGroup
                      label="What counts"
                      value={state().draft.activity}
                      onChange={(value) => { if (value === "either" || value === "study" || value === "karaoke") props.onActivityChange(value); }}
                    >
                      <For each={["either", "study", "karaoke"] as const}>
                        {(activity) => <OptionCard value={activity} title={activityLabel[activity]} />}
                      </For>
                    </OptionCardGroup>
                  </Show>
                  <Show when={state().problem}>
                    {(problem) => (
                      <Type as="p" class="text-destructive-text" variant="caption">{problem()}</Type>
                    )}
                  </Show>
                </div>
                <ModalFooter>
                  <Button disabled={state().problem !== undefined} onClick={props.onReview}>
                    Review
                  </Button>
                </ModalFooter>
              </>
            )}
          </Match>

          <Match when={props.state.step === "quote" && props.state}>
            {(state) => (
              <>
                <div class="space-y-2">
                  <div class="flex items-baseline gap-2">
                    <Type as="p" variant="h3">{state().quote.budgetLabel}</Type>
                    <Type variant="body-strong">{state().quote.tokenSymbol}</Type>
                  </div>
                  <Type as="p" class="text-muted-foreground" variant="caption">
                    {kindTitle[state().quote.kind]} · {state().quote.yieldLabel} ·{" "}
                    {activityLabel[state().quote.activity].toLowerCase()}
                  </Type>
                  <Type as="p" class="text-muted-foreground" variant="caption">
                    Terms are final once funded. Anything unspent comes back to you.
                  </Type>
                </div>
                <ModalFooter>
                  <Button onClick={props.onFund}>Fund</Button>
                  <Button variant="ghost" onClick={props.onBack}>Back</Button>
                </ModalFooter>
              </>
            )}
          </Match>

          <Match when={props.state.step === "confirming"}>
            <Type as="p" class="text-muted-foreground" variant="caption">
              Sending the reviewed transfer. Wait for its status.
            </Type>
          </Match>

          <Match when={props.state.step === "awaiting_finality" && props.state}>
            {(state) => (
              <>
                <Type as="p" class="text-muted-foreground" variant="caption">
                  Sent. Waiting for confirmation — you can close this.
                </Type>
                <Show when={state().transactionHash}>
                  {(hash) => (
                    <Type as="p" class="break-all text-muted-foreground" variant="caption">{hash()}</Type>
                  )}
                </Show>
              </>
            )}
          </Match>

          <Match when={props.state.step === "active" && props.state}>
            {(state) => (
              <>
                <Type as="p" variant="body-strong">{state().live.rewardLabel}</Type>
                <Type as="p" class="text-muted-foreground" variant="caption">
                  {state().live.remainingLabel}
                </Type>
              </>
            )}
          </Match>

          <Match when={props.state.step === "failed" && props.state}>
            {(state) => (
              <>
                <Type as="p" variant="body-strong">{failureTitle(state().failure)}</Type>
                <Type as="p" class="text-muted-foreground" variant="caption">
                  {failureLine(state().failure)}
                </Type>
                <Show when={state().transactionHash}>
                  {(hash) => (
                    <Type as="p" class="break-all text-muted-foreground" variant="caption">{hash()}</Type>
                  )}
                </Show>
                <ModalFooter>
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
                </ModalFooter>
              </>
            )}
          </Match>
        </Switch>
      </ModalContent>
    </Modal>
  );
}
