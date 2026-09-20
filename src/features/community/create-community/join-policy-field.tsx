/** @jsxImportSource @solidjs/web */
import { For, Show, createMemo, createSignal, createUniqueId } from "solid-js";

import {
  Button,
  CheckboxCard,
  Chip,
  FormNote,
  IconX,
  OptionCard,
  OptionCardGroup,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TextField,
  TextFieldInput,
  Type,
  cn,
} from "../../../design-system";
import { NATIONALITY_COUNTRY_ALPHA2_CODES, normalizeIdentityCountryAlpha2 } from "../../verification/nationality-country-codes.ts";

export type JoinPolicyKind = "palm" | "nationality";

export interface JoinPolicyCopy {
  readonly title: string;
  readonly palmTitle: string;
  readonly nationalityTitle: string;
  /** The one-line policy shown while the authoring gate hides the choice. */
  readonly statement: string;
  readonly addNationality: string;
  readonly pickerLabel: string;
  readonly pickerPlaceholder: string;
  readonly doneLabel: string;
  readonly removeCountry: string;
  readonly emptyError: string;
}

/**
 * The community join policy choice: one mutually exclusive option between the
 * Palm policy and the document-nationality policy. While the authoring
 * context hides the nationality option there is no choice to offer, so the
 * field states the one available policy in a single line instead of rendering
 * a one-card radio group. No copy names a verification provider.
 *
 * Choosing nationality offers "Add nationality", which opens a bottom sheet
 * with a searchable checkbox list; the selection shows as removable chips
 * under the trigger. There is deliberately no frozen fallback for a saved
 * nationality policy behind a closed gate: with authoring off, an intent
 * carrying nationality is stored as gate_unsupported and can never commit.
 * If package B makes nationality policies real, that case returns with tests
 * for how it actually arises.
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
  const searchId = `join-policy-search-${headingId}`;
  const [sheetOpen, setSheetOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const locale = () => props.locale ?? "en";
  const names = createMemo(() => new Intl.DisplayNames([locale()], { type: "region" }));
  const options = createMemo(() =>
    NATIONALITY_COUNTRY_ALPHA2_CODES.map(code => ({ code, name: names().of(code) ?? code }))
      .sort((left, right) => left.name.localeCompare(right.name, locale())),
  );
  const selected = () => props.policy === "nationality";
  const emptyErrorVisible = () =>
    selected() && props.countries.length === 0 && props.showEmptyError === true;
  const filtered = createMemo(() => {
    const needle = query().trim().toLowerCase();
    if (needle === "") return options();
    return options().filter(option =>
      option.name.toLowerCase().includes(needle) || option.code.toLowerCase() === needle);
  });
  const toggle = (code: string) => {
    props.onCountriesChange(
      props.countries.includes(code)
        ? props.countries.filter(value => value !== code)
        : [...props.countries, code],
    );
  };
  const countryName = (code: string) => names().of(normalizeIdentityCountryAlpha2(code) ?? code) ?? code;

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
            <Button
              class="self-start"
              disabled={props.disabled}
              onClick={() => setSheetOpen(true)}
              type="button"
              variant="outline"
            >
              {props.copy.addNationality}
            </Button>
            <Show when={props.countries.length > 0}>
              <div class="flex flex-wrap gap-1.5">
                <For each={props.countries}>
                  {(code) => (
                    <Chip
                      aria-label={props.copy.removeCountry.replace("{country}", countryName(code))}
                      disabled={props.disabled}
                      onClick={() => toggle(code)}
                      size="sm"
                      variant="selected"
                    >
                      {countryName(code)}
                      <IconX aria-hidden="true" class="size-3.5" />
                    </Chip>
                  )}
                </For>
              </div>
            </Show>
            <Show when={emptyErrorVisible()}>
              <FormNote tone="destructive">{props.copy.emptyError}</FormNote>
            </Show>
          </div>
          <Sheet onOpenChange={setSheetOpen} open={sheetOpen()}>
            <SheetContent class="flex max-h-[85dvh] flex-col" side="bottom">
              <SheetHeader>
                <SheetTitle>{props.copy.pickerLabel}</SheetTitle>
              </SheetHeader>
              <TextField onChange={setQuery} value={query()}>
                <TextFieldInput
                  aria-label={props.copy.pickerPlaceholder}
                  class="rounded-[var(--radius-lg)] bg-card"
                  placeholder={props.copy.pickerPlaceholder}
                />
              </TextField>
              <div class="min-h-0 flex-1 overflow-y-auto py-2" role="group" aria-label={props.copy.pickerLabel}>
                <For each={filtered()}>
                  {(option) => (
                    <CheckboxCard
                      checked={props.countries.includes(option.code)}
                      class="mb-1 p-3"
                      onCheckedChange={() => toggle(option.code)}
                      title={option.name}
                    />
                  )}
                </For>
              </div>
              <SheetFooter>
                <Button onClick={() => setSheetOpen(false)} type="button">
                  {props.copy.doneLabel}
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </Show>
      </Show>
    </section>
  );
}
