// Derivative (remix) source selection. One search surface: results carry
// artwork, title and creator, selected songs sit directly below, and the empty
// states say what to do next instead of explaining the registration pipeline.
// A host can feed results through `derivativeState.searchResults`; without a
// provider the search is honest about having no matches yet.

import { For, Show } from "solid-js";

import {
  Checkbox,
  CheckboxLabel,
  FormNote,
  IconMagnifyingGlass,
  IconMusicNote,
  IconTrash,
  Input,
  Type,
} from "../../../design-system";
import { cn } from "../../../design-system";
import type { ComposerCopy } from "./copy";
import { dedupeReferences } from "./reference-model";
import type { ComposerReference, DerivativeStepState } from "./types";

export type DerivativeStateUpdater = (
  updater: (current: DerivativeStepState | undefined) => DerivativeStepState | undefined,
) => void;

export interface DerivativeSectionLabels {
  acceptTermsLabel?: string;
  placeholder?: string;
  searchAriaLabel?: string;
  sectionTitle?: string;
}

function ReferenceArtwork(props: { item: ComposerReference; size?: "sm" | "md" }) {
  const sizeClass = () => props.size === "sm" ? "size-10" : "size-12";
  return (
    <Show
      when={props.item.artworkUrl?.trim()}
      fallback={
        <span
          aria-hidden="true"
          class={cn("grid shrink-0 place-items-center rounded-[var(--radius-md)] border border-border-soft bg-muted/40 text-muted-foreground", sizeClass())}
        >
          <IconMusicNote class="size-5" />
        </span>
      }
    >
      {(url) => (
        <img
          alt=""
          class={cn("shrink-0 rounded-[var(--radius-md)] border border-border-soft object-cover", sizeClass())}
          src={url()}
        />
      )}
    </Show>
  );
}

export function PostComposerDerivativeSection(props: {
  copy: ComposerCopy;
  derivativePickerKey: number;
  derivativeSearchResults: ComposerReference[];
  derivativeState?: DerivativeStepState;
  labels?: DerivativeSectionLabels;
  onAdvancePicker: () => void;
  updateDerivativeState: DerivativeStateUpdater;
}) {
  const query = () => props.derivativeState?.query ?? "";
  const references = () => props.derivativeState?.references ?? [];
  const loading = () => props.derivativeState?.searchLoading === true;
  const searchError = () => props.derivativeState?.searchError?.trim() || null;
  const searched = () => query().trim() !== "";
  const sourceTermsAcceptedId = "derivative-source-terms-accepted";

  const patch = (changes: Partial<DerivativeStepState>) => {
    props.updateDerivativeState(current => ({
      visible: true,
      trigger: current?.trigger ?? "remix",
      required: current?.required,
      searchResults: current?.searchResults,
      searchError: current?.searchError,
      searchLoading: current?.searchLoading,
      references: current?.references,
      sourceTermsAccepted: current?.sourceTermsAccepted,
      ...changes,
    }));
  };

  const selectReference = (reference: ComposerReference) => {
    patch({
      query: "",
      searchError: undefined,
      references: dedupeReferences([...references(), reference]),
      sourceTermsAccepted: false,
    });
    props.onAdvancePicker();
  };

  return (
    <Show when={props.derivativeState?.visible}>
      <section class="space-y-3">
        <label class="relative block">
          <IconMagnifyingGlass
            aria-hidden="true"
            class="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label={props.labels?.searchAriaLabel ?? props.copy.derivative.searchSongs}
            class="ps-10"
            onChange={(event) => patch({ query: event.currentTarget.value })}
            placeholder={props.labels?.placeholder ?? props.copy.placeholders.sourceTrackSearch}
            value={query()}
          />
        </label>

        <Show when={searchError()}>
          {(message) => <FormNote tone="warning">{message()}</FormNote>}
        </Show>
        <Show when={loading()}>
          <FormNote>{props.copy.common.loading}</FormNote>
        </Show>
        <Show when={!loading() && !searchError() && !searched() && references().length === 0}>
          <FormNote>{props.copy.derivative.chooseSource}</FormNote>
        </Show>
        <Show when={!loading() && !searchError() && searched() && props.derivativeSearchResults.length === 0}>
          <FormNote>{props.copy.derivative.noMatches}</FormNote>
        </Show>

        <Show when={!loading() && props.derivativeSearchResults.length > 0}>
          <ul class="space-y-2">
            <For each={props.derivativeSearchResults}>
              {(reference) => (
                <li>
                  <button
                    class="flex w-full items-center gap-3 rounded-[var(--radius-lg)] border border-border-soft bg-card p-2.5 text-start transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => selectReference(reference)}
                    type="button"
                  >
                    <ReferenceArtwork item={reference} />
                    <span class="min-w-0 flex-1">
                      <Type as="span" class="block truncate" variant="body-strong">{reference.title}</Type>
                      <Show when={reference.subtitle?.trim()}>
                        {(subtitle) => (
                          <Type as="span" class="block truncate text-muted-foreground" variant="caption">{subtitle()}</Type>
                        )}
                      </Show>
                    </span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>

        <Show when={references().length > 0}>
          <div class="space-y-2">
            <For each={references()}>
              {(reference) => (
                <div class="flex items-center gap-3 rounded-[var(--radius-lg)] border border-border-soft bg-card p-2.5">
                  <ReferenceArtwork item={reference} />
                  <div class="min-w-0 flex-1">
                    <Type as="p" class="truncate" variant="body-strong">{reference.title}</Type>
                    <Show when={reference.subtitle?.trim()}>
                      {(subtitle) => (
                        <Type as="p" class="truncate text-muted-foreground" variant="caption">{subtitle()}</Type>
                      )}
                    </Show>
                  </div>
                  <button
                    aria-label={`${props.copy.buttons.clear} ${reference.title}`}
                    class="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => patch({
                      references: references().filter((item) => item.id !== reference.id),
                      sourceTermsAccepted: false,
                    })}
                    type="button"
                  >
                    <IconTrash class="size-5" />
                  </button>
                </div>
              )}
            </For>
          </div>
          <div class="flex items-start gap-2 px-1 py-1">
            <Checkbox
              checked={props.derivativeState?.sourceTermsAccepted === true}
              class="mt-0.5"
              id={sourceTermsAcceptedId}
              onChange={(next) => patch({ sourceTermsAccepted: next === true })}
            >
              <CheckboxLabel class="text-muted-foreground">
                {props.labels?.acceptTermsLabel ?? props.copy.derivative.acceptSourceTerms}
              </CheckboxLabel>
            </Checkbox>
          </div>
        </Show>
      </section>
    </Show>
  );
}
