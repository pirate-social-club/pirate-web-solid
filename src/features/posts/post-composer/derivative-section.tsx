// Derivative (remix / uses-song) section + source-mode tabs, ported from the
// React post-composer-sections.tsx.

import { For, Show } from "solid-js";

import {
  Checkbox,
  CheckboxLabel,
  createIsMobile,
  FormSectionHeading,
  Tabs,
  TabsList,
  TabsTrigger,
} from "../../../design-system";
import { cn } from "../../../design-system";
import type { ComposerCopy } from "./copy";
import {
  References,
  SearchReferencePicker,
  SelectedReferenceCard,
  dedupeReferences,
} from "./references";
import type { ComposerReference, DerivativeStepState } from "./types";

export type DerivativeStateUpdater = (
  updater: (current: DerivativeStepState | undefined) => DerivativeStepState | undefined,
) => void;

export interface DerivativeSectionLabels {
  acceptTermsLabel?: string;
  emptyLabel?: string;
  placeholder?: string;
  searchAriaLabel?: string;
  sectionTitle?: string;
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
  const isMobile = createIsMobile();
  const sourceTermsAcceptedId = "derivative-source-terms-accepted";
  const searchError = () => props.derivativeState?.searchError?.trim() || null;
  const searchLoading = () => !searchError() && (
    props.derivativeState?.searchLoading === true
    || props.derivativeState?.searchResults === undefined
  );

  return (
    <Show when={props.derivativeState?.visible}>
      <section class={cn("space-y-3 rounded-[var(--radius-lg)] border border-border-soft bg-card p-4", isMobile() && "rounded-none border-0 bg-transparent p-0")}>
        <FormSectionHeading title={props.labels?.sectionTitle ?? props.copy.sections.sourceTrack} />
        <SearchReferencePicker
          ariaLabel={props.labels?.searchAriaLabel ?? props.copy.derivative.searchSourceTracks}
          emptyLabel={searchError() ?? props.labels?.emptyLabel ?? props.copy.empty.noSourceTracks}
          items={props.derivativeSearchResults}
          loading={searchLoading()}
          loadingLabel={props.copy.common.loading}
          onSelect={(reference) => {
            props.updateDerivativeState((current) => ({
              visible: true,
              trigger: current?.trigger ?? "remix",
              query: "",
              requirementLabel: current?.requirementLabel,
              required: current?.required,
              searchResults: current?.searchResults,
              searchError: undefined,
              searchLoading: false,
              references: dedupeReferences([...(current?.references ?? []), reference]),
              licenseSummary: current?.licenseSummary,
              sourceTermsAccepted: false,
            }));
            props.onAdvancePicker();
          }}
          placeholder={props.labels?.placeholder ?? props.copy.placeholders.sourceTrackSearch}
        />
        <Show when={props.derivativeState?.requirementLabel}>
          {(requirementLabel) => (
            <div class={cn("rounded-[var(--radius-lg)] bg-muted px-4 py-3 text-base text-foreground", isMobile() && "rounded-lg px-0 py-2 bg-transparent text-muted-foreground")}>
              {requirementLabel()}
            </div>
          )}
        </Show>
        <Show
          when={props.derivativeState?.references?.length}
          fallback={<References copy={props.copy} items={props.derivativeState?.references} />}
        >
          <div class="space-y-2">
            <For each={props.derivativeState?.references ?? []}>
              {(reference) => (
                <SelectedReferenceCard
                  clearLabel={props.copy.buttons.clear}
                  item={reference}
                  onClear={() => {
                    props.updateDerivativeState((current) => {
                      if (!current) {
                        return current;
                      }
                      return {
                        ...current,
                        references: (current.references ?? []).filter((item) => item.id !== reference.id),
                        sourceTermsAccepted: false,
                      };
                    });
                  }}
                />
              )}
            </For>
          </div>
        </Show>
        <Show when={props.derivativeState?.references?.length}>
          <div class={cn("flex items-start gap-2 px-1 py-1", isMobile() && "px-0")}>
            <Checkbox
              checked={props.derivativeState?.sourceTermsAccepted === true}
              class="mt-0.5"
              id={sourceTermsAcceptedId}
              onChange={(next) =>
                props.updateDerivativeState((current) => current
                  ? { ...current, sourceTermsAccepted: next === true }
                  : current)
              }
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

export interface SourceModeOption {
  label: string;
  value: string;
}

export function PostComposerSourceModeTabs(props: {
  modes: SourceModeOption[];
  onValueChange: (value: string) => void;
  value: string;
}) {
  return (
    <Tabs
      class="w-full"
      onChange={props.onValueChange}
      value={props.value}
    >
      <TabsList class="grid h-auto w-full grid-cols-2 rounded-full border border-border-soft">
        <For each={props.modes}>
          {(mode) => (
            <TabsTrigger
              class="h-10 min-w-0 px-3 font-semibold"
              value={mode.value}
            >
              {mode.label}
            </TabsTrigger>
          )}
        </For>
      </TabsList>
    </Tabs>
  );
}
