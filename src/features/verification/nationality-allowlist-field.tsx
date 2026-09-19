/** @jsxImportSource @solidjs/web */
import { Show, createMemo, createUniqueId } from "solid-js";

import { CheckboxCard, FormNote, MultiCombobox, Type } from "../../design-system";
import { NATIONALITY_COUNTRY_ALPHA2_CODES, normalizeIdentityCountryAlpha2 } from "./nationality-country-codes.ts";

export interface NationalityAllowlistCopy {
  readonly label: string;
  readonly description: string;
  readonly pickerLabel: string;
  readonly pickerPlaceholder: string;
  readonly emptyError: string;
}

/** Default English copy; callers with localized strings pass their own object. */
export const NATIONALITY_ALLOWLIST_COPY: NationalityAllowlistCopy = {
  label: "Limit by nationality",
  description: "Members prove nationality with a supported document.",
  pickerLabel: "Allowed nationalities",
  pickerPlaceholder: "Search countries",
  emptyError: "Choose at least one country.",
};

/**
 * The shared nationality allowlist control for community admission and handle
 * qualification. It never authors evidence lifetime and never names a
 * verification provider: the joining user chooses that at the ceremony.
 */
export function NationalityAllowlistField(props: Readonly<{
  countries: readonly string[] | undefined;
  onChange: (countries: readonly string[] | undefined) => void;
  locale?: string;
  disabled?: boolean;
  copy?: Partial<NationalityAllowlistCopy>;
  /** Shows the empty-selection error; set it after interaction or a submit attempt. */
  showEmptyError?: boolean;
}>) {
  const id = createUniqueId();
  const copy = (): NationalityAllowlistCopy => ({ ...NATIONALITY_ALLOWLIST_COPY, ...props.copy });
  const locale = () => props.locale ?? "en";
  const names = createMemo(() => new Intl.DisplayNames([locale()], { type: "region" }));
  const options = createMemo(() =>
    NATIONALITY_COUNTRY_ALPHA2_CODES.map(code => ({ code, name: names().of(code) ?? code }))
      .sort((left, right) => left.name.localeCompare(right.name, locale())),
  );
  const enabled = () => props.countries !== undefined;
  const emptyErrorVisible = () =>
    enabled() && props.countries?.length === 0 && props.showEmptyError === true;

  return (
    <div class="flex min-w-0 flex-col gap-3">
      <CheckboxCard
        checked={enabled()}
        description={copy().description}
        disabled={props.disabled}
        onCheckedChange={checked => props.onChange(checked ? [] : undefined)}
        title={copy().label}
      />
      <Show when={enabled()}>
        <div class="flex min-w-0 flex-col gap-2 ps-1">
          <Type as="span" variant="label">{copy().pickerLabel}</Type>
          <MultiCombobox
            aria-label={copy().pickerLabel}
            class="w-full"
            disabled={props.disabled}
            filter={(option, input) => {
              const query = input.trim().toLowerCase();
              return query === ""
                || option.name.toLowerCase().includes(query)
                || option.code.toLowerCase() === query;
            }}
            onChange={codes => props.onChange(codes)}
            optionLabel={option => option.name}
            optionValue={option => option.code}
            options={options()}
            placeholder={copy().pickerPlaceholder}
            value={(props.countries ?? []).flatMap(code => {
              const normalized = normalizeIdentityCountryAlpha2(code);
              return normalized === null ? [] : [normalized];
            })}
          />
          <Show when={emptyErrorVisible()}>
            <FormNote tone="destructive">{copy().emptyError}</FormNote>
          </Show>
        </div>
      </Show>
    </div>
  );
}
