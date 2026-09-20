/** @jsxImportSource @solidjs/web */
import { Show, createMemo, createUniqueId } from "solid-js";

import {
  FormNote,
  MultiCombobox,
  OptionCard,
  OptionCardGroup,
  Type,
  cn,
} from "../../../design-system";
import { NATIONALITY_COUNTRY_ALPHA2_CODES, normalizeIdentityCountryAlpha2 } from "../../verification/nationality-country-codes.ts";

export type JoinPolicyKind = "palm" | "nationality";

export interface JoinPolicyCopy {
  readonly title: string;
  readonly palmTitle: string;
  readonly nationalityTitle: string;
  /** The Palm fact shown while the authoring gate hides the choice. */
  readonly statement: string;
  readonly pickerLabel: string;
  readonly pickerPlaceholder: string;
  readonly removeCountry: string;
  readonly emptyError: string;
}

/**
 * The community join policy page: two mutually exclusive options, and the
 * country multi-select with its chips inline under the nationality option —
 * the legacy shape, not a separate trigger. The page itself renders only
 * when the authoring context offers the choice; while the gate is closed
 * creation has no join-policy page at all. No copy names a verification
 * provider.
 *
 * There is deliberately no frozen fallback for a saved nationality policy
 * behind a closed gate: with authoring off, an intent carrying nationality is
 * stored as gate_unsupported and can never commit. If package B makes
 * nationality policies real, that case returns with tests for how it
 * actually arises.
 */
export function JoinPolicyField(props: Readonly<{
  policy: JoinPolicyKind;
  countries: readonly string[];
  allowNationality: boolean;
  onPolicyChange: (policy: JoinPolicyKind) => void;
  onCountriesChange: (countries: readonly string[]) => void;
  /** Shows the empty-selection error; set it after picker interaction or a blocked Continue. */
  showEmptyError?: boolean;
  disabled?: boolean;
  locale?: string;
  copy: JoinPolicyCopy;
}>) {
  const headingId = createUniqueId();
  const locale = () => props.locale ?? "en";
  const names = createMemo(() => new Intl.DisplayNames([locale()], { type: "region" }));
  const options = createMemo(() =>
    NATIONALITY_COUNTRY_ALPHA2_CODES.map(code => ({ code, name: names().of(code) ?? code }))
      .sort((left, right) => left.name.localeCompare(right.name, locale())),
  );
  const selected = () => props.policy === "nationality";
  const emptyErrorVisible = () =>
    selected() && props.countries.length === 0 && props.showEmptyError === true;

  return (
    <section aria-labelledby={headingId} class="flex flex-col gap-2" data-community-join-policy>
      <div class="mb-1" id={headingId}>
        <Type as="span" variant="body-strong">{props.copy.title}</Type>
      </div>
      <Show
        when={props.allowNationality}
        fallback={<Type as="p" variant="body">{props.copy.statement}</Type>}
      >
        <OptionCardGroup
          labelledBy={headingId}
          disabled={props.disabled}
          onChange={(value) => {
            if (value === "palm" || value === "nationality") props.onPolicyChange(value);
          }}
          value={props.policy}
        >
          <OptionCard
            title={props.copy.palmTitle}
            value="palm"
          />
          <OptionCard
            title={props.copy.nationalityTitle}
            value="nationality"
          />
        </OptionCardGroup>
      </Show>
      <Show when={selected()}>
        <div class="flex min-w-0 flex-col gap-2 ps-1">
          <MultiCombobox
            aria-label={props.copy.pickerLabel}
            class="w-full"
            disabled={props.disabled}
            filter={(option, input) => {
              const query = input.trim().toLowerCase();
              return query === ""
                || option.name.toLowerCase().includes(query)
                || option.code.toLowerCase() === query;
            }}
            onChange={codes => props.onCountriesChange(codes)}
            optionLabel={option => option.name}
            optionValue={option => option.code}
            options={options()}
            placeholder={props.copy.pickerPlaceholder}
            removeLabel={label => props.copy.removeCountry.replace("{country}", label)}
            value={props.countries.flatMap(code => {
              const normalized = normalizeIdentityCountryAlpha2(code);
              return normalized === null ? [] : [normalized];
            })}
          />
          <Show when={emptyErrorVisible()}>
            <FormNote tone="destructive">{props.copy.emptyError}</FormNote>
          </Show>
        </div>
      </Show>
    </section>
  );
}
