import { Show, createMemo, createUniqueId } from "solid-js";
import {
  Button, Input, Modal, ModalContent, ModalDescription, ModalHeader,
  ModalTitle, buttonVariants,
} from "../../../design-system";
import { useUiLocale } from "../../../lib/ui-locale";
import { getLocaleMessages, interpolateMessage } from "../../../locales";
import {
  normalizeDesiredHandleLabel, offeringAppliesToLabel,
  type SupportedHnsOffering,
} from "../handle-storefront/handle-storefront.model";

export type CommunityJoinNameState = {
  readonly label: string;
  readonly acknowledged: boolean;
} & (
  | { readonly kind: "editing"; readonly issue?: "taken" | "invalid" }
  | { readonly kind: "submitting"; readonly stage: "profile" | "joining" | "issuing" }
  | { readonly kind: "failed"; readonly joined: boolean }
  | { readonly kind: "pending"; readonly claimId: string }
  | { readonly kind: "issued"; readonly identifier: string }
  | { readonly kind: "joined" }
);

export interface CommunityJoinNameProps {
  readonly communityName: string;
  readonly offering: SupportedHnsOffering;
  readonly state: CommunityJoinNameState;
  /** Naming policy is supplied by the owner-approved journey, never inferred from a missing Skip control. */
  readonly nameOptional: boolean;
  readonly joined: boolean;
  readonly open: boolean;
  readonly forceMobile?: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onLabelChange: (label: string) => void;
  readonly onAcknowledgementChange: (acknowledged: boolean) => void;
  readonly onSubmit: () => void;
  readonly onResume: () => void;
}

/** Controlled real-app surface. Membership, identity and issuance authority stay with the caller. */
export function CommunityJoinName(props: CommunityJoinNameProps) {
  const copy = getLocaleMessages(useUiLocale(), "routes").communityJoinName;
  const id = createUniqueId();
  const state = () => props.state;
  const normalized = createMemo(() => normalizeDesiredHandleLabel(state().label));
  const valid = createMemo(() => {
    const label = normalized();
    return label !== null && offeringAppliesToLabel(props.offering, label);
  });
  const invalid = createMemo(() => state().label !== "" && !valid());
  const busy = () => state().kind === "submitting";
  const pending = () => state().kind === "pending";
  const issued = () => state().kind === "issued";
  const issuedIdentifier = () => { const current = state(); return current.kind === "issued" ? current.identifier : ""; };
  const joinedWithoutName = () => state().kind === "joined";
  const taken = () => { const current = state(); return current.kind === "editing" && current.issue === "taken"; };
  const failed = () => { const current = state(); return current.kind === "failed" ? current : undefined; };
  const disabled = createMemo(() => busy() || pending() || (state().label === ""
    ? !props.nameOptional : !valid() || !state().acknowledged));
  const band = () => props.offering.label_scope.kind === "label_rule_v2"
    ? interpolateMessage(copy.length, {
        min: props.offering.label_scope.availability.min_label_length,
        max: props.offering.label_scope.availability.max_label_length,
      }) : copy.exactName;
  const progress = () => {
    const current = state();
    if (current.kind !== "submitting") return copy.join;
    return current.stage === "profile" ? copy.preparing : current.stage === "joining" ? copy.joining : copy.issuing;
  };
  const issuedHref = createMemo(() => {
    const current = state();
    if (current.kind !== "issued" || !valid()
      || current.identifier !== `${normalized()}.${props.offering.display_root}`
      || !/^[a-z0-9-]+$/u.test(props.offering.namespace_root)) return undefined;
    return `https://${normalized()}.${props.offering.namespace_root}/`;
  });

  return <Modal forceMobile={props.forceMobile} open={props.open} onOpenChange={props.onOpenChange}>
    <ModalContent
      aria-label={copy.title}
      mobileSide="bottom"
      class="max-h-[90dvh] overflow-y-auto rounded-t-[var(--radius-sheet)] bg-background px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-6 sm:max-w-md sm:rounded-[var(--radius-xl)] sm:p-8"
    >
      <div class="flex flex-col gap-6" data-community-join-name-state={state().kind}>
        <ModalHeader class="text-start">
          <ModalTitle>{issued() ? copy.successTitle : joinedWithoutName() ? copy.joinedTitle : copy.title}</ModalTitle>
          <Show when={issued() || joinedWithoutName()}>
            <ModalDescription>{issued() ? copy.successDescription : copy.joinedDescription}</ModalDescription>
          </Show>
        </ModalHeader>

        <Show when={issued() || joinedWithoutName()} fallback={
          <form class="flex flex-col gap-5" onSubmit={event => { event.preventDefault(); if (!disabled()) props.onSubmit(); }}>
            <div class="flex flex-col gap-2">
              <label class="text-sm font-semibold" for={`${id}-name`}>{props.nameOptional ? copy.labelOptional : copy.label}</label>
              <div class="flex items-center rounded-[var(--radius-lg)] border border-input bg-background px-4 focus-within:ring-2 focus-within:ring-ring" dir="ltr">
                <Input
                  id={`${id}-name`} class="min-w-0 border-0 px-0 shadow-none focus-visible:ring-0"
                  value={state().label} autocomplete="nickname" autocapitalize="none"
                  spellcheck={false} disabled={busy() || pending()}
                  aria-describedby={`${id}-hint`}
                  aria-invalid={invalid() || taken() ? "true" : undefined}
                  onInput={event => props.onLabelChange(event.currentTarget.value)}
                />
                <span class="shrink-0 text-muted-foreground">.{props.offering.display_root}</span>
              </div>
              <p class={`min-h-10 text-sm leading-5 sm:min-h-5 ${invalid() || taken() ? "text-destructive-text" : "text-muted-foreground"}`} id={`${id}-hint`}
                role={invalid() || taken() ? "alert" : undefined}>
                {taken() ? props.joined ? copy.takenAfterJoin : copy.taken
                  : invalid() && normalized() === null ? copy.invalid : band()}
              </p>
            </div>

            <label class="flex items-start gap-3 text-sm leading-5">
              <input type="checkbox" class="mt-0.5 size-5 shrink-0 accent-primary"
                checked={state().acknowledged} disabled={busy() || pending()}
                onChange={event => props.onAcknowledgementChange(event.currentTarget.checked)} />
              <span>{copy.acknowledgement}</span>
            </label>

            <Show when={failed()}>{failure => <p class="text-sm text-destructive-text" role="alert">
              {failure().joined ? copy.failedAfterJoin : copy.failedBeforeJoin}
            </p>}</Show>
            <Show when={pending()}><p class="text-sm text-muted-foreground" role="status">{copy.pending}</p></Show>
            <Show when={pending()} fallback={
              <Button class="w-full" type="submit" loading={busy()} disabled={disabled()}>
                {busy() ? progress() : failed() ? copy.retry : props.joined ? copy.getName : copy.join}
              </Button>
            }>
              <Button class="w-full" onClick={props.onResume}>{copy.checkStatus}</Button>
            </Show>
          </form>
        }>
          <Show when={issued()} fallback={<Button class="w-full" onClick={() => props.onOpenChange(false)}>{copy.done}</Button>}>
            <p class="break-all text-center text-xl font-semibold" dir="ltr">{issuedIdentifier()}</p>
            <Show when={issuedHref()} fallback={<p role="alert">{copy.resultUnavailable}</p>}>
              {href => <a class={buttonVariants({ variant: "default" })} href={href()}>{copy.openName}</a>}
            </Show>
          </Show>
        </Show>
      </div>
    </ModalContent>
  </Modal>;
}
