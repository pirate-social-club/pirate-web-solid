import { For, Show, createMemo, createSignal } from "solid-js";

import { Button, CheckboxCard, IconCheck, OptionCard, Type, cn } from "@pirate/web-solid-ui";

import { interpolateMessage } from "../../../locales";
import { useUiLocale } from "../../../lib/ui-locale";
import {
  compileGateWizardDraft,
  incompleteGateCheckKinds,
  isGateCheckSelectable,
  replaceGateCheck,
  selectedGateCheck,
  toggleGateCheck,
  visibleGateChecks,
  type CompiledGateRequirement,
  type GateCheckCatalogMode,
  type GateWizardDraft,
} from "./community-gate-wizard-model";
import { GateCheckConfigForm } from "./gate-check-config-forms";
import { createGateWizardCopyAccessor, type GateWizardCopy } from "./gate-wizard-copy";

export const GATE_WIZARD_STEPS = ["membership", "invite", "checks", "review"] as const;
export type GateWizardStep = (typeof GATE_WIZARD_STEPS)[number];

export interface CommunityGateWizardPageProps {
  class?: string;
  /** "production" shows only shippable checks; "exploration" (default) is the story-owned full catalog. */
  catalogMode?: GateCheckCatalogMode;
  draft: GateWizardDraft;
  onDraftChange?: (draft: GateWizardDraft) => void;
  onFinish?: () => void;
  initialStep?: GateWizardStep;
}

function countryName(copy: GateWizardCopy, code: string): string {
  // SAFETY: locale country catalogs are string-keyed maps; unknown ISO codes
  // fall back to Intl.DisplayNames below.
  const countries = copy.checks.nationality.countries as Record<string, string>;
  return countries[code] ?? new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
}

function requirementText(copy: GateWizardCopy, requirement: CompiledGateRequirement): string {
  const labels = copy.review.requirements;
  switch (requirement.requirement) {
    case "human-verification":
      return labels.humanVerification;
    case "invite":
      return labels.invite;
    case "age-minimum":
      return labels.ageMinimum;
    case "nationality-allowed":
      return interpolateMessage(labels.nationalityAllowed, {
        countries: requirement.allowedCountries.map((code) => countryName(copy, code)).join(", "),
      });
    case "gender-marker":
      return interpolateMessage(labels.genderMarker, {
        markers: requirement.allowedMarkers.join(", "),
      });
    case "erc721-collection":
      return interpolateMessage(labels.erc721Collection, {
        count: requirement.minCount,
        contract: requirement.contractAddress,
      });
    case "inventory-match":
      return interpolateMessage(labels.inventoryMatch, {
        quantity: requirement.minQuantity,
        category:
          requirement.category === "trading-card"
            ? copy.checks.nft.categoryTradingCard
            : copy.checks.nft.categoryWatch,
        subject: requirement.subject,
      });
    case "asset-ownership":
      return interpolateMessage(labels.assetOwnership, {
        amount: requirement.minAmount,
        asset: requirement.assetId,
      });
    case "reputation-score":
      return interpolateMessage(labels.reputationScore, { score: requirement.minimumScore });
  }
}

export function CommunityGateWizardPage(props: CommunityGateWizardPageProps) {
  const locale = () => useUiLocale();
  const copy = createGateWizardCopyAccessor(locale);
  const catalogMode = () => props.catalogMode ?? "exploration";
  const [step, setStep] = createSignal<GateWizardStep>(props.initialStep ?? "membership");
  const compiled = createMemo(() => compileGateWizardDraft(props.draft));
  const requirements = () => compiled().accessPaths[0]?.requirements ?? [];
  const checkRequirements = () =>
    requirements().filter(
      (requirement) =>
        requirement.requirement !== "human-verification" && requirement.requirement !== "invite",
    );

  const updateDraft = (next: GateWizardDraft) => props.onDraftChange?.(next);
  const stepIndex = () => GATE_WIZARD_STEPS.indexOf(step());
  const canAdvance = () => step() !== "checks" || incompleteGateCheckKinds(props.draft).length === 0;
  const goNext = () => {
    if (step() === "review") {
      props.onFinish?.();
      return;
    }
    setStep(GATE_WIZARD_STEPS[stepIndex() + 1]);
  };
  const goBack = () => {
    if (stepIndex() > 0) setStep(GATE_WIZARD_STEPS[stepIndex() - 1]);
  };

  const capabilityNote = (capability: string) => {
    if (catalogMode() !== "exploration") return null;
    if (capability === "design-hold") return copy().checks.capability.designHold;
    if (capability === "exploration") return copy().checks.capability.exploration;
    return null;
  };

  return (
    <section
      class={cn("mx-auto flex w-full max-w-3xl flex-col gap-6", props.class)}
      data-community-gate-wizard
      data-gate-wizard-step={step()}
    >
      <div class="space-y-1">
        <Type as="h1" responsiveSize="desktop4xl" variant="h1">{copy().title}</Type>
        <Type as="p" variant="caption">{copy().description}</Type>
      </div>

      <div class="flex items-center justify-between gap-3 border-b border-border-soft pb-3">
        <Show when={stepIndex() > 0} fallback={<span />}>
          <Button onClick={goBack} size="sm" variant="ghost">{copy().actions.back}</Button>
        </Show>
        <Type as="p" class="text-end text-muted-foreground" variant="caption">
          {interpolateMessage(copy().progress, {
            current: stepIndex() + 1,
            total: GATE_WIZARD_STEPS.length,
            step: copy().steps[step()],
          })}
        </Type>
      </div>

      <Show when={step() === "membership"}>
        <div class="space-y-4">
          <div class="space-y-1">
            <Type as="h2" variant="h2">{copy().membership.heading}</Type>
            <Type as="p" variant="caption">{copy().membership.description}</Type>
          </div>
          <div class="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={copy().membership.heading}>
            <OptionCard
              aria-checked={props.draft.membershipMode === "humans-only" ? "true" : "false"}
              role="radio"
              selected={props.draft.membershipMode === "humans-only"}
              title={copy().membership.humansOnlyTitle}
              description={copy().membership.humansOnlyDescription}
              onClick={() => updateDraft({ ...props.draft, membershipMode: "humans-only" })}
            />
            <OptionCard
              aria-checked={props.draft.membershipMode === "humans-and-bots" ? "true" : "false"}
              role="radio"
              selected={props.draft.membershipMode === "humans-and-bots"}
              title={copy().membership.humansAndBotsTitle}
              description={copy().membership.humansAndBotsDescription}
              onClick={() => updateDraft({ ...props.draft, membershipMode: "humans-and-bots" })}
            />
          </div>
        </div>
      </Show>

      <Show when={step() === "invite"}>
        <div class="space-y-4">
          <div class="space-y-1">
            <Type as="h2" variant="h2">{copy().invite.heading}</Type>
            <Type as="p" variant="caption">{copy().invite.description}</Type>
          </div>
          <div class="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={copy().invite.heading}>
            <OptionCard
              aria-checked={props.draft.inviteRule === "open" ? "true" : "false"}
              role="radio"
              selected={props.draft.inviteRule === "open"}
              title={copy().invite.openTitle}
              description={copy().invite.openDescription}
              onClick={() => updateDraft({ ...props.draft, inviteRule: "open" })}
            />
            <OptionCard
              aria-checked={props.draft.inviteRule === "invite-required" ? "true" : "false"}
              role="radio"
              selected={props.draft.inviteRule === "invite-required"}
              title={copy().invite.inviteRequiredTitle}
              description={copy().invite.inviteRequiredDescription}
              onClick={() => updateDraft({ ...props.draft, inviteRule: "invite-required" })}
            />
          </div>
        </div>
      </Show>

      <Show when={step() === "checks"}>
        <div class="space-y-4">
          <div class="space-y-1">
            <Type as="h2" variant="h2">{copy().checks.heading}</Type>
            <Type as="p" variant="caption">{copy().checks.description}</Type>
          </div>
          <For each={visibleGateChecks(catalogMode())}>
            {(entry) => {
              const check = () => selectedGateCheck(props.draft, entry.kind);
              return (
                <div class="space-y-2" data-gate-check={entry.kind}>
                  <CheckboxCard
                    checked={check() !== null}
                    description={copy().checks.catalog[entry.kind].description}
                    disabled={!isGateCheckSelectable(entry, catalogMode())}
                    disabledHint={
                      !isGateCheckSelectable(entry, catalogMode())
                        ? copy().checks.capability.comingLater
                        : undefined
                    }
                    title={copy().checks.catalog[entry.kind].label}
                    onCheckedChange={() =>
                      updateDraft(toggleGateCheck(props.draft, entry.kind, catalogMode()))
                    }
                  />
                  <Show when={capabilityNote(entry.capability)} keyed>
                    {(note) => (
                      <Type as="p" class="px-1 text-muted-foreground" variant="caption">
                        {note}
                      </Type>
                    )}
                  </Show>
                  <Show when={check()} keyed>
                    {(selected) => (
                      <GateCheckConfigForm
                        check={selected}
                        copy={copy}
                        onReplace={(next) => updateDraft(replaceGateCheck(props.draft, next))}
                      />
                    )}
                  </Show>
                </div>
              );
            }}
          </For>
          <Show when={props.draft.checks.length === 0}>
            <Type
              as="p"
              class="rounded-[var(--radius-xl)] border border-dashed border-border-soft bg-card px-5 py-6 text-center"
              variant="caption"
            >
              {copy().checks.noneSelected}
            </Type>
          </Show>
          <Type as="p" class="rounded-[var(--radius-xl)] bg-muted/40 px-4 py-3" variant="caption">
            {copy().checks.engagementNote}
          </Type>
        </div>
      </Show>

      <Show when={step() === "review"}>
        <div class="space-y-4">
          <div class="space-y-1">
            <Type as="h2" variant="h2">{copy().review.heading}</Type>
            <Type as="p" variant="caption">{copy().review.description}</Type>
          </div>
          <div class="grid gap-3 rounded-[var(--radius-2_5xl)] border border-border-soft bg-card p-5 sm:grid-cols-2">
            <div class="space-y-1">
              <Type as="div" variant="label">{copy().review.whoCanJoin}</Type>
              <Type as="p" variant="body">
                {props.draft.membershipMode === "humans-only"
                  ? copy().membership.humansOnlyTitle
                  : copy().membership.humansAndBotsTitle}
              </Type>
            </div>
            <div class="space-y-1">
              <Type as="div" variant="label">{copy().review.invitation}</Type>
              <Type as="p" variant="body">
                {props.draft.inviteRule === "invite-required"
                  ? copy().invite.inviteRequiredTitle
                  : copy().invite.openTitle}
              </Type>
            </div>
          </div>
          <div
            class="space-y-3 rounded-[var(--radius-2_5xl)] border border-border-soft bg-card p-5"
            data-gate-review-checks
          >
            <Type as="div" variant="label">{copy().review.checksLabel}</Type>
            <Show
              when={checkRequirements().length > 0}
              fallback={<Type as="p" variant="caption">{copy().review.noChecksNote}</Type>}
            >
              <Type as="p" variant="caption">{copy().review.allRequirementsNote}</Type>
              <ul class="space-y-2" aria-label={copy().review.checksLabel}>
                <For each={checkRequirements()}>
                  {(requirement) => (
                    <li class="flex items-start gap-2">
                      <IconCheck class="mt-1 size-4 shrink-0 text-primary" />
                      <Type as="span" variant="body">
                        {requirementText(copy(), requirement)}
                      </Type>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
          <Type as="p" class="text-muted-foreground" variant="caption">
            {copy().review.engagementNotice}
          </Type>
        </div>
      </Show>

      <div class="flex justify-end">
        <Button disabled={!canAdvance()} onClick={goNext}>
          {step() === "review" ? copy().actions.finish : copy().actions.next}
        </Button>
      </div>
    </section>
  );
}
