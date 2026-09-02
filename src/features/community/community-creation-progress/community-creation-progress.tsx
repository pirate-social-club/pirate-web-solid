/** @jsxImportSource @solidjs/web */

import { Show } from "solid-js";

import { Button, FormNote, Type, cn } from "@pirate/web-solid-ui";
import { getLocaleMessages } from "../../../locales";
import { useUiLocale } from "../../../lib/ui-locale";
import {
  CREATION_STATUS_COPY_KEYS,
  HUMAN_IDENTITY_COPY_KEYS,
  WAIT_REASON_COPY_KEYS,
  type CommunityCreationIntentView,
  type CreationProgressCopy,
} from "./community-creation-progress-model";

export interface CommitCommunityInput {
  intentId: string;
  expectedRevision: number;
}

/**
 * Spec 012 §3: the start endpoint takes the reserved ceremony id and
 * generation, the requirement, and the creation's current revision for
 * optimistic concurrency. The client idempotency key belongs to the API
 * adapter, not to this view.
 */
export interface StartVerificationInput {
  intentId: string;
  expectedRevision: number;
  requirement: "human_identity";
  ceremonyIntentId: string;
  providerId: string;
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
  // Read the locale once at setup: the context value is a plain code, not a
  // signal, and deferring the read means event handlers would call useContext
  // outside a reactive owner.
  const locale = useUiLocale();
  // SAFETY: the generated routes catalog guarantees the communityCreationProgress key shape for every UI locale.
  const copy = () => getLocaleMessages(locale, "routes").communityCreationProgress as CreationProgressCopy;

  const statusLabel = () => copy()[CREATION_STATUS_COPY_KEYS[props.intent.status]];
  const identityLabel = () => copy()[HUMAN_IDENTITY_COPY_KEYS[props.intent.humanIdentity.status]];
  const nextAction = () => props.intent.nextAction;

  const renderAction = () => {
    const action = nextAction();
    switch (action.kind) {
      case "start_verification":
        return (
          <Button onClick={() => props.onStartVerification?.({
            intentId: props.intent.intentId,
            expectedRevision: props.intent.revision,
            requirement: action.requirement,
            ceremonyIntentId: action.ceremonyIntentId,
            providerId: action.providerId,
            generation: action.generation,
          })}>
            {copy().startVerification}
          </Button>
        );
      case "commit":
        return (
          <Button
            loading={props.committing}
            onClick={() => props.onCommit?.({ intentId: props.intent.intentId, expectedRevision: props.intent.revision })}
          >
            {copy().commit}
          </Button>
        );
      case "wait":
        return (
          <div class="space-y-3 rounded-[var(--radius-lg)] border border-border-soft bg-muted/30 p-5" data-wait-state>
            <Type as="p" variant="body-strong">{copy()[WAIT_REASON_COPY_KEYS[action.reasonCode]]}</Type>
            <Show when={action.retryAfterSeconds}>
              <Type as="p" variant="caption">{copy().retryAfterPrefix} {action.retryAfterSeconds}s</Type>
            </Show>
          </div>
        );
      case "blocked":
        return (
          <div class="space-y-3 rounded-[var(--radius-lg)] border border-destructive/40 bg-destructive/5 p-5" data-blocked-state>
            <Type as="p" variant="body-strong">{statusLabel()}</Type>
            <FormNote tone="destructive">
              {action.reason === "quota_exceeded" ? copy().quotaExceededBody : copy().gateUnsupportedBody}
            </FormNote>
          </div>
        );
      case "none":
        if (action.reason === "committed") {
          return (
            <div class="space-y-3 rounded-[var(--radius-lg)] border border-primary/40 bg-primary-subtle p-5" data-committed-state>
              <Type as="p" variant="body-strong">{copy().committedBody}</Type>
              <Show when={props.intent.committedHref}>
                <Button onClick={props.onView} variant="secondary">{copy().viewCommunity}</Button>
              </Show>
            </div>
          );
        }
        return (
          <FormNote tone="muted">
            {action.reason === "expired" ? copy().expiredBody : copy().cancelledBody}
          </FormNote>
        );
    }
  };

  return (
    <section class={cn("mx-auto flex w-full max-w-2xl flex-col gap-6", props.class)} data-community-creation-progress>
      <header class="space-y-2">
        <Type as="h1" variant="h1">{copy().title}</Type>
        <Type as="p" variant="body-strong">{statusLabel()}</Type>
      </header>

      <Show when={props.staleRevision}>
        <div class="space-y-3 rounded-[var(--radius-lg)] border border-warning/40 bg-warning/10 p-5" role="alert">
          <Type as="p" variant="body-strong">{copy().staleTitle}</Type>
          <FormNote tone="warning">{copy().staleBody}</FormNote>
          <Button onClick={props.onRetry} variant="secondary">{copy().retry}</Button>
        </div>
      </Show>

      <section aria-label={copy().identityHeading} class="space-y-3 rounded-[var(--radius-lg)] border border-border-soft bg-card p-5">
        <div class="flex items-center justify-between gap-4">
          <Type as="h2" variant="h3">{copy().identityHeading}</Type>
          <Type as="span" variant="caption">{identityLabel()}</Type>
        </div>
      </section>

      {renderAction()}
    </section>
  );
}

export const CommunityCreationProgress = CommunityCreationProgressView;
