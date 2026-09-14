/** @jsxImportSource @solidjs/web */
import { For, Show, createUniqueId } from "solid-js";
import { NATIONALITY_COUNTRY_ALPHA2_CODES, normalizeIdentityCountryAlpha2 } from "./nationality-country-codes.ts";

/** Shared by community admission and offering qualification; never authors evidence lifetime. */
export function NationalityAllowlistField(props: Readonly<{
  countries: readonly string[] | undefined;
  onChange: (countries: readonly string[] | undefined) => void;
  locale?: string;
  disabled?: boolean;
  label?: string;
}>) {
  const id = createUniqueId();
  const names = new Intl.DisplayNames([props.locale ?? "en"], { type: "region" });
  const options = NATIONALITY_COUNTRY_ALPHA2_CODES.map(code => ({ code, name: names.of(code) ?? code }))
    .sort((left, right) => left.name.localeCompare(right.name, props.locale ?? "en"));
  const selected = () => new Set(props.countries?.map(normalizeIdentityCountryAlpha2));
  return <fieldset disabled={props.disabled} class="flex min-w-0 flex-col gap-2 rounded-xl border border-border p-3">
    <label class="flex items-center gap-2">
      <input type="checkbox" checked={props.countries !== undefined} onChange={event => props.onChange(event.currentTarget.checked ? ["US"] : undefined)} />
      <span>{props.label ?? "Require nationality verification"}</span>
    </label>
    <p id={`${id}-help`} class="text-sm text-muted-foreground">Nationality on a supported document, not residence. Users can choose Self or ZKPassport.</p>
    <Show when={props.countries !== undefined}>
      <label for={id}>Allowed nationalities</label>
      <select id={id} multiple size={6} aria-describedby={`${id}-help`} class="w-full min-w-0 max-w-full rounded-lg border border-border bg-background p-2"
        onChange={event => props.onChange([...event.currentTarget.selectedOptions].map(option => option.value))}>
        <For each={options}>{option => <option value={option.code} selected={selected().has(option.code)}>{option.name}</option>}</For>
      </select>
      <Show when={props.countries?.length === 0}><p role="alert">Choose at least one nationality.</p></Show>
    </Show>
  </fieldset>;
}
