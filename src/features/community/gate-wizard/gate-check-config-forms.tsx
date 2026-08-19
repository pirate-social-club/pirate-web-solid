import { For, Show } from "solid-js";

import {
  Button,
  Checkbox,
  FormFieldLabel,
  Input,
  OptionCard,
  Type,
} from "@pirate/web-solid-ui";

import {
  GENDER_MARKER_OPTIONS,
  NATIONALITY_COUNTRY_OPTIONS,
  NFT_COLLECTIBLE_CATEGORIES,
  isGateCheckComplete,
  type GateWizardCheck,
  type GenderMarker,
} from "./community-gate-wizard-model";
import type { GateWizardCopy } from "./gate-wizard-copy";

type NationalityCheck = Extract<GateWizardCheck, { kind: "nationality" }>;
type GenderCheck = Extract<GateWizardCheck, { kind: "gender" }>;
type NftCheck = Extract<GateWizardCheck, { kind: "nft" }>;
type TokenBalanceCheck = Extract<GateWizardCheck, { kind: "token_balance" }>;
type PassportScoreCheck = Extract<GateWizardCheck, { kind: "passport_score" }>;

const configCardClass = "space-y-4 rounded-[var(--radius-2_5xl)] border border-border-soft bg-card p-5";
const errorClass = "text-sm text-destructive-text";
const chipsClass = "grid grid-cols-2 gap-2 sm:grid-cols-3";

function clampCount(value: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function ConfigError(props: { message: string }) {
  return <Type as="p" class={errorClass}>{props.message}</Type>;
}

function NationalityConfigForm(props: {
  copy: () => GateWizardCopy;
  check: NationalityCheck;
  onReplace: (check: GateWizardCheck) => void;
}) {
  const copy = () => props.copy().checks.nationality;
  const countryName = (code: string) => {
    // SAFETY: the generated catalog keys are exactly NATIONALITY_COUNTRY_OPTIONS;
    // the Record view exists only so an unknown code falls back to the code itself.
    const countries = copy().countries as Record<string, string>;
    return countries[code] ?? code;
  };
  const toggleCountry = (code: string, selected: boolean) => {
    const allowedCountries = selected
      ? [...props.check.allowedCountries, code]
      : props.check.allowedCountries.filter((existing) => existing !== code);
    props.onReplace({ kind: "nationality", allowedCountries });
  };
  return (
    <div class={configCardClass} data-gate-check-config="nationality">
      <Type as="div" variant="label">{copy().heading}</Type>
      <div class={chipsClass} role="group" aria-label={copy().heading}>
        <For each={NATIONALITY_COUNTRY_OPTIONS}>
          {(code) => (
            <label class="flex cursor-pointer items-center gap-2 rounded-[var(--radius-lg)] border border-border-soft bg-background px-3 py-2">
              <Checkbox
                aria-label={countryName(code)}
                checked={props.check.allowedCountries.includes(code)}
                onChange={(next) => toggleCountry(code, next === true)}
              />
              <span class="text-sm">{countryName(code)}</span>
            </label>
          )}
        </For>
      </div>
      <Show when={props.check.allowedCountries.length === 0}>
        <ConfigError message={copy().emptyError} />
      </Show>
    </div>
  );
}

function GenderConfigForm(props: {
  copy: () => GateWizardCopy;
  check: GenderCheck;
  onReplace: (check: GateWizardCheck) => void;
}) {
  const copy = () => props.copy().checks.gender;
  const markerLabel = (marker: GenderMarker) =>
    marker === "M" ? copy().markerM : copy().markerF;
  const toggleMarker = (marker: GenderMarker, selected: boolean) => {
    const allowedMarkers = selected
      ? [...props.check.allowedMarkers, marker]
      : props.check.allowedMarkers.filter((existing) => existing !== marker);
    props.onReplace({ kind: "gender", allowedMarkers });
  };
  return (
    <div class={configCardClass} data-gate-check-config="gender">
      <Type as="div" variant="label">{copy().heading}</Type>
      <div class="flex flex-wrap gap-2" role="group" aria-label={copy().heading}>
        <For each={GENDER_MARKER_OPTIONS}>
          {(marker) => (
            <label class="flex cursor-pointer items-center gap-2 rounded-[var(--radius-lg)] border border-border-soft bg-background px-3 py-2">
              <Checkbox
                aria-label={markerLabel(marker)}
                checked={props.check.allowedMarkers.includes(marker)}
                onChange={(next) => toggleMarker(marker, next === true)}
              />
              <span class="text-sm">{markerLabel(marker)}</span>
            </label>
          )}
        </For>
      </div>
      <Show when={props.check.allowedMarkers.length === 0}>
        <ConfigError message={copy().emptyError} />
      </Show>
    </div>
  );
}

function NftConfigForm(props: {
  copy: () => GateWizardCopy;
  check: NftCheck;
  onReplace: (check: GateWizardCheck) => void;
}) {
  const copy = () => props.copy().checks.nft;
  const setMode = (mode: "collection" | "collectible") => {
    if (mode === props.check.config.mode) return;
    props.onReplace(
      mode === "collection"
        ? { kind: "nft", config: { mode, contractAddress: "", minCount: 1 } }
        : { kind: "nft", config: { mode, category: "trading-card", subject: "", minQuantity: 1 } },
    );
  };
  const updateCollection = (patch: { contractAddress?: string; minCount?: number }) => {
    if (props.check.config.mode !== "collection") return;
    props.onReplace({ kind: "nft", config: { ...props.check.config, ...patch } });
  };
  const updateCollectible = (patch: { category?: string; subject?: string; minQuantity?: number }) => {
    if (props.check.config.mode !== "collectible") return;
    props.onReplace({ kind: "nft", config: { ...props.check.config, ...patch } });
  };
  const categoryLabel = (category: string) =>
    category === "trading-card" ? copy().categoryTradingCard : copy().categoryWatch;
  return (
    <div class={configCardClass} data-gate-check-config="nft">
      <div class="grid gap-2 sm:grid-cols-2" role="group" aria-label={copy().heading}>
        <OptionCard
          aria-checked={props.check.config.mode === "collection" ? "true" : "false"}
          role="radio"
          selected={props.check.config.mode === "collection"}
          title={copy().modeCollection}
          onClick={() => setMode("collection")}
        />
        <OptionCard
          aria-checked={props.check.config.mode === "collectible" ? "true" : "false"}
          role="radio"
          selected={props.check.config.mode === "collectible"}
          title={copy().modeCollectible}
          onClick={() => setMode("collectible")}
        />
      </div>
      <Show
        when={props.check.config.mode === "collection"}
        fallback={
          <div class="space-y-4">
            <div class="space-y-2">
              <FormFieldLabel htmlFor="gate-nft-category" label={copy().categoryLabel} />
              <div class="flex flex-wrap gap-2">
                <For each={NFT_COLLECTIBLE_CATEGORIES}>
                  {(category) => (
                    <Button
                      size="sm"
                      variant={
                        props.check.config.mode === "collectible" && props.check.config.category === category
                          ? "default"
                          : "secondary"
                      }
                      onClick={() => updateCollectible({ category })}
                    >
                      {categoryLabel(category)}
                    </Button>
                  )}
                </For>
              </div>
            </div>
            <div class="space-y-2">
              <FormFieldLabel htmlFor="gate-nft-subject" label={copy().subjectLabel} />
              <Input
                id="gate-nft-subject"
                onInput={(event) => updateCollectible({ subject: event.currentTarget.value })}
                placeholder={copy().subjectPlaceholder}
                value={props.check.config.mode === "collectible" ? props.check.config.subject : ""}
              />
            </div>
            <div class="space-y-2">
              <FormFieldLabel htmlFor="gate-nft-quantity" label={copy().minQuantityLabel} />
              <Input
                id="gate-nft-quantity"
                max={100}
                min={1}
                type="number"
                onInput={(event) =>
                  updateCollectible({ minQuantity: clampCount(event.currentTarget.value, 1, 100) })
                }
                value={props.check.config.mode === "collectible" ? props.check.config.minQuantity : 1}
              />
            </div>
            <Show
              when={
                props.check.config.mode === "collectible" &&
                props.check.config.subject.trim() === ""
              }
            >
              <ConfigError message={copy().subjectError} />
            </Show>
          </div>
        }
      >
        <div class="space-y-4">
          <div class="space-y-2">
            <FormFieldLabel htmlFor="gate-nft-contract" label={copy().contractLabel} />
            <Input
              id="gate-nft-contract"
              onInput={(event) => updateCollection({ contractAddress: event.currentTarget.value })}
              placeholder={copy().contractPlaceholder}
              value={props.check.config.mode === "collection" ? props.check.config.contractAddress : ""}
            />
            <Show
              when={
                props.check.config.mode === "collection" &&
                props.check.config.contractAddress.trim() !== "" &&
                !isGateCheckComplete(props.check)
              }
            >
              <ConfigError message={copy().contractError} />
            </Show>
          </div>
          <div class="space-y-2">
            <FormFieldLabel htmlFor="gate-nft-count" label={copy().minCountLabel} />
            <Input
              id="gate-nft-count"
              max={100}
              min={1}
              type="number"
              onInput={(event) =>
                updateCollection({ minCount: clampCount(event.currentTarget.value, 1, 100) })
              }
              value={props.check.config.mode === "collection" ? props.check.config.minCount : 1}
            />
          </div>
        </div>
      </Show>
    </div>
  );
}

function TokenBalanceConfigForm(props: {
  copy: () => GateWizardCopy;
  check: TokenBalanceCheck;
  onReplace: (check: GateWizardCheck) => void;
}) {
  const copy = () => props.copy().checks.tokenBalance;
  return (
    <div class={configCardClass} data-gate-check-config="token_balance">
      <Type as="div" variant="label">{copy().heading}</Type>
      <div class="space-y-2">
        <FormFieldLabel htmlFor="gate-token-asset" label={copy().assetLabel} />
        <Input
          id="gate-token-asset"
          onInput={(event) =>
            props.onReplace({ ...props.check, assetId: event.currentTarget.value })
          }
          placeholder={copy().assetPlaceholder}
          value={props.check.assetId}
        />
        <Show when={props.check.assetId.trim() !== "" && !isGateCheckComplete(props.check)}>
          <ConfigError message={copy().assetError} />
        </Show>
      </div>
      <div class="space-y-2">
        <FormFieldLabel htmlFor="gate-token-amount" label={copy().amountLabel} />
        <Input
          id="gate-token-amount"
          onInput={(event) =>
            props.onReplace({ ...props.check, minAmount: event.currentTarget.value })
          }
          placeholder={copy().amountPlaceholder}
          value={props.check.minAmount}
        />
        <Show when={props.check.minAmount.trim() !== "" && !isGateCheckComplete(props.check)}>
          <ConfigError message={copy().amountError} />
        </Show>
      </div>
    </div>
  );
}

function PassportScoreConfigForm(props: {
  copy: () => GateWizardCopy;
  check: PassportScoreCheck;
  onReplace: (check: GateWizardCheck) => void;
}) {
  const copy = () => props.copy().checks.passportScore;
  return (
    <div class={configCardClass} data-gate-check-config="passport_score">
      <div class="space-y-2">
        <FormFieldLabel htmlFor="gate-passport-score" label={copy().label} />
        <Input
          id="gate-passport-score"
          max={100}
          min={0}
          type="number"
          onInput={(event) =>
            props.onReplace({
              kind: "passport_score",
              minimumScore: clampCount(event.currentTarget.value, 0, 100),
            })
          }
          value={props.check.minimumScore}
        />
        <Type as="p" variant="caption">{copy().hint}</Type>
      </div>
    </div>
  );
}

export function GateCheckConfigForm(props: {
  copy: () => GateWizardCopy;
  check: GateWizardCheck;
  onReplace: (check: GateWizardCheck) => void;
}) {
  switch (props.check.kind) {
    case "age18":
      return null;
    case "nationality":
      return <NationalityConfigForm check={props.check} copy={props.copy} onReplace={props.onReplace} />;
    case "gender":
      return <GenderConfigForm check={props.check} copy={props.copy} onReplace={props.onReplace} />;
    case "nft":
      return <NftConfigForm check={props.check} copy={props.copy} onReplace={props.onReplace} />;
    case "token_balance":
      return <TokenBalanceConfigForm check={props.check} copy={props.copy} onReplace={props.onReplace} />;
    case "passport_score":
      return <PassportScoreConfigForm check={props.check} copy={props.copy} onReplace={props.onReplace} />;
  }
}
