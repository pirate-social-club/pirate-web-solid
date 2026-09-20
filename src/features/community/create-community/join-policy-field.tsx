/** @jsxImportSource @solidjs/web */
import { Show, createMemo, createUniqueId } from "solid-js";

import { FormNote, MultiCombobox, OptionCard, OptionCardGroup, Type } from "../../../design-system";
import { NATIONALITY_COUNTRY_ALPHA2_CODES, normalizeIdentityCountryAlpha2 } from "../../verification/nationality-country-codes.ts";

export type JoinPolicyKind = "palm" | "nationality";

export interface JoinPolicyCopy {
  readonly title: string;
  readonly palmTitle: string;
  readonly palmDescription: string;
  readonly nationalityTitle: string;
  readonly nationalityDescription: string;
  readonly nationalityHint: string;
  readonly pickerLabel: string;
  readonly pickerPlaceholder: string;
  readonly emptyError: string;
}

/**
 * The community join policy choice: one mutually exclusive option between the
 * Palm policy and the document-nationality policy. The nationality option is
 * only offered when the authoring context allows it; choosing it reveals the
 * empty country picker and never renders a stacked Palm requirement. No copy
 * names a verification provider.
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
      <OptionCardGroup
        labelledBy={headingId}
        disabled={props.disabled}
        onChange={(value) => {
          if (value === "palm" || value === "nationality") props.onPolicyChange(value);
        }}
        value={props.policy}
      >
        <OptionCard
          description={props.copy.palmDescription}
          title={props.copy.palmTitle}
          value="palm"
        />
        <Show when={props.allowNationality}>
          <OptionCard
            description={props.copy.nationalityDescription}
            title={props.copy.nationalityTitle}
            value="nationality"
          />
        </Show>
      </OptionCardGroup>
      <Show when={selected()}>
        <div class="flex min-w-0 flex-col gap-2 ps-1">
          <Type as="p" variant="caption" class="text-sm leading-5">{props.copy.nationalityHint}</Type>
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
    </section>
  );
}
