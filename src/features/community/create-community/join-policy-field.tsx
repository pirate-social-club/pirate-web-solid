/** @jsxImportSource @solidjs/web */
import { Show, createMemo, createUniqueId } from "solid-js";

import { FormNote, MultiCombobox, OptionCard, OptionCardGroup, Type, cn } from "../../../design-system";
import { NATIONALITY_COUNTRY_ALPHA2_CODES, normalizeIdentityCountryAlpha2 } from "../../verification/nationality-country-codes.ts";

export type JoinPolicyKind = "palm" | "nationality";

export interface JoinPolicyCopy {
  readonly title: string;
  readonly palmTitle: string;
  readonly nationalityTitle: string;
  /** The one-line policy shown while the authoring gate hides the choice. */
  readonly statement: string;
  readonly pickerLabel: string;
  readonly pickerPlaceholder: string;
  readonly emptyError: string;
}

/**
 * The community join policy choice: one mutually exclusive option between the
 * Palm policy and the document-nationality policy. While the authoring
 * context hides the nationality option there is no choice to offer, so the
 * field states the one available policy in a single line instead of rendering
 * a one-card radio group. No copy names a verification provider.
 *
 * There is deliberately no frozen fallback for a saved nationality policy
 * behind a closed gate: with authoring off, an intent carrying nationality is
 * stored as gate_unsupported and can never commit, so no reachable draft can
 * hold one. If package B makes nationality policies real, that case returns
 * with tests for how it actually arises.
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
  /**
   * Hides the section heading when the page header already carries its text.
   * The heading element stays in the DOM as the radio group's accessible
   * name; it is never removed.
   */
  hideHeading?: boolean;
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
      <div class={cn("mb-1", props.hideHeading && "sr-only")} id={headingId}>
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
      </Show>
    </section>
  );
}
