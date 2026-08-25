import { Show } from "solid-js";

import { Button, FormNote, Type, cn } from "@pirate/web-solid-ui";
import {
  creationProgressCopy,
  type CommunityCreationIntentView,
} from "./community-creation-progress-model";

export interface CommitCommunityInput {
  intentId: string;
  expectedRevision: number;
}

export interface StartVerificationInput {
  intentId: string;
  ceremonyIntentId: string;
  generation: number;
}

export interface CommunityCreationProgressProps {
  class?: string;
  committing?: boolean;
  intent: CommunityCreationIntentView;
  staleRevision?: { expectedRevision: number } | null;
  onCommit?: (input: CommitCommunityInput) => void;
  onRetry?: () => void;
  onStartVerification?: (input: StartVerificationInput) => void;
  onView?: () => void;
}

export function CommunityCreationProgressView(props: CommunityCreationProgressProps) {
  const statusLabel = () => creationProgressCopy.statusLabels[props.intent.status];
  const identityLabel = () => creationProgressCopy.identityStatusLabels[props.intent.humanIdentity.status];
  const nextAction = () => props.intent.nextAction;

  const renderAction = () => {
    const action = nextAction();
    switch (action.kind) {
      case "start_verification":
        return (
          <Button onClick={() => props.onStartVerification?.({
            intentId: props.intent.intentId,
            ceremonyIntentId: action.ceremonyIntentId,
            generation: action.generation,
          })}>
            {creationProgressCopy.startVerification}
          </Button>
        );
      case "commit":
        return (
          <Button
            loading={props.committing}
            onClick={() => props.onCommit?.({ intentId: props.intent.intentId, expectedRevision: props.intent.revision })}
          >
            {creationProgressCopy.commit}
          </Button>
        );
      case "wait":
        return (
          <div class="space-y-3 rounded-[var(--radius-lg)] border border-border-soft bg-muted/30 p-5" data-wait-state>
            <Type as="p" variant="body-strong">{creationProgressCopy.waitReasonLabels[action.reasonCode]}</Type>
            <Show when={action.retryAfterSeconds}>
              <Type as="p" variant="caption">{creationProgressCopy.retryAfterPrefix} {action.retryAfterSeconds}s</Type>
            </Show>
          </div>
        );
      case "blocked":
        return (
          <div class="space-y-3 rounded-[var(--radius-lg)] border border-destructive/40 bg-destructive/5 p-5" data-blocked-state>
            <Type as="p" variant="body-strong">{statusLabel()}</Type>
            <FormNote tone="destructive">
              {action.reason === "quota_exceeded"
                ? creationProgressCopy.quotaExceededBody
                : creationProgressCopy.gateUnsupportedBody}
            </FormNote>
          </div>
        );
      case "none":
        if (action.reason === "committed") {
          return (
            <div class="space-y-3 rounded-[var(--radius-lg)] border border-primary/40 bg-primary-subtle p-5" data-committed-state>
              <Type as="p" variant="body-strong">{creationProgressCopy.committedBody}</Type>
              <Show when={props.intent.committedHref}>
                <Button onClick={props.onView} variant="secondary">{creationProgressCopy.viewCommunity}</Button>
              </Show>
            </div>
          );
        }
        return (
          <FormNote tone="muted">
            {action.reason === "expired" ? creationProgressCopy.expiredBody : creationProgressCopy.cancelledBody}
          </FormNote>
        );
    }
  };

  return (
    <section class={cn("mx-auto flex w-full max-w-2xl flex-col gap-6", props.class)} data-community-creation-progress>
      <header class="space-y-2">
        <Type as="h1" variant="h1">{creationProgressCopy.title}</Type>
        <div class="flex items-baseline gap-2">
          <Type as="p" variant="body-strong">{statusLabel()}</Type>
          <Type as="span" variant="caption">{creationProgressCopy.revisionPrefix} {props.intent.revision}</Type>
        </div>
      </header>

      <Show when={props.staleRevision}>
        {(stale) => (
          <div class="space-y-3 rounded-[var(--radius-lg)] border border-warning/40 bg-warning/10 p-5" role="alert">
            <Type as="p" variant="body-strong">{creationProgressCopy.staleTitle}</Type>
            <FormNote tone="warning">{creationProgressCopy.staleBody}</FormNote>
            <Type as="p" variant="caption">
              {creationProgressCopy.staleExpectedLabel} {stale().expectedRevision}; {creationProgressCopy.staleLatestLabel} {props.intent.revision}.
            </Type>
            <Button onClick={props.onRetry} variant="secondary">{creationProgressCopy.retry}</Button>
          </div>
        )}
      </Show>

      <section aria-label={creationProgressCopy.identityHeading} class="space-y-3 rounded-[var(--radius-lg)] border border-border-soft bg-card p-5">
        <div class="flex items-center justify-between gap-4">
          <Type as="h2" variant="h3">{creationProgressCopy.identityHeading}</Type>
          <Type as="span" variant="caption">{identityLabel()}</Type>
        </div>
        <div class="flex flex-col gap-1">
          <Type as="div" variant="caption">{creationProgressCopy.providerLabel}: {props.intent.humanIdentity.providerId}</Type>
          <Type as="div" variant="caption">{creationProgressCopy.generationLabel} {props.intent.humanIdentity.generation}</Type>
        </div>
      </section>

      {renderAction()}
    </section>
  );
}

export const CommunityCreationProgress = CommunityCreationProgressView;
