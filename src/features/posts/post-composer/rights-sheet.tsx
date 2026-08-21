// Song rights sheet: the modal body for the song path. "This song is" and
// "Others can" are standard ResponsiveOptionSelect fields (popover on desktop,
// bottom sheet on mobile). Payout is a chevron row that pushes the payout
// sub-sheet. The remix source picker renders under the "This song is" field.
// Commerce controls stay out of the song path in v1.

import { Show, createSignal, type ParentProps } from "solid-js";

import {
  Button,
  IconCaretRight,
  ModalHeader,
  ModalTitle,
  ResponsiveOptionSelect,
  Type,
  type ResponsiveOptionSelectOption,
} from "../../../design-system";
import type { PostComposerController } from "./controller";
import { PostComposerDerivativeSection } from "./derivative-section";
import { PayoutSheet } from "./payout-sheet";
import type { AssetLicensePresetId } from "./types";

const licensePresets: AssetLicensePresetId[] = [
  "non-commercial",
  "commercial-use",
  "commercial-remix",
];

function collaboratorCount(controller: PostComposerController): number {
  return controller.royaltySplit.state.allocations.filter(
    (allocation) => allocation.recipientKind === "collaborator",
  ).length;
}

function payoutSummary(controller: PostComposerController): string {
  const count = collaboratorCount(controller);
  if (count === 0) return controller.copy.rights.payoutSolo;
  return controller.copy.rights.payoutSplit(count);
}

export function buildRightsSummary(controller: PostComposerController): string {
  const rights = controller.copy.rights;
  const mode = controller.primary.activeSongMode;
  const rightsPart = mode === "remix" ? rights.remix : rights.original;
  const licensePart = rights.licenseTitles[controller.license.state.presetId]
    ?? controller.license.state.presetId;
  return `${rightsPart} · ${licensePart} · ${payoutSummary(controller)}`;
}

export function PostComposerRightsSheet(props: {
  controller: PostComposerController;
  initialSection?: "payout";
  onDone: () => void;
}) {
  const controller = props.controller;
  const copy = () => controller.copy.rights;
  const [view, setView] = createSignal<"summary" | "payout">(
    props.initialSection === "payout" ? "payout" : "summary",
  );
  const mode = () => controller.primary.activeSongMode;
  const license = () => controller.license.state.presetId;

  const songModeOptions = (): ResponsiveOptionSelectOption[] => [
    { value: "original", label: copy().original },
    { value: "remix", label: copy().remix },
  ];
  const licenseOptions = (): ResponsiveOptionSelectOption[] =>
    licensePresets.map((preset) => ({
      value: preset,
      label: copy().licenseTitles[preset],
    }));

  const selectSongMode = (value: string) => {
    controller.primary.handleSongModeChange(value === "remix" ? "remix" : "original");
  };

  const selectLicense = (value: string) => {
    const preset = licensePresets.find((candidate) => candidate === value);
    if (!preset) return;
    controller.license.update((current) => ({
      presetId: preset,
      commercialRevSharePct: preset === "commercial-remix"
        ? current.commercialRevSharePct ?? 10
        : undefined,
    }));
  };

  return (
    <Show
      when={view() === "summary"}
      fallback={
        <PayoutSheet
          controller={controller}
          onBack={() => setView("summary")}
          onDone={props.onDone}
        />
      }
    >
      <ModalHeader class="px-4 pe-12 text-start">
        <ModalTitle>{copy().title}</ModalTitle>
      </ModalHeader>

      <div class="space-y-5 px-4 pb-4 pt-5">
        <Field label={copy().thisSongIs}>
          <ResponsiveOptionSelect
            ariaLabel={copy().thisSongIs}
            drawerTitle={copy().thisSongIs}
            onValueChange={selectSongMode}
            options={songModeOptions()}
            value={mode()}
          />
        </Field>

        <Show when={mode() === "remix"}>
          <PostComposerDerivativeSection
            copy={controller.copy}
            derivativePickerKey={controller.primary.derivativePickerKey}
            derivativeSearchResults={controller.primary.derivativeSearchResults}
            derivativeState={controller.primary.derivativeState}
            onAdvancePicker={controller.advanceDerivativePicker}
            updateDerivativeState={controller.primary.updateDerivativeState}
          />
        </Show>

        <Field label={copy().othersCan}>
          <ResponsiveOptionSelect
            ariaLabel={copy().othersCan}
            drawerTitle={copy().othersCan}
            onValueChange={selectLicense}
            options={licenseOptions()}
            value={license()}
          />
        </Field>

        <button
          class="flex w-full items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border-soft bg-card px-4 py-3 text-start outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setView("payout")}
          type="button"
        >
          <div class="min-w-0 space-y-0.5">
            <Type as="div" variant="caption" class="text-muted-foreground">{copy().payoutLabel}</Type>
            <Type as="div" variant="body-strong" class="truncate">{payoutSummary(controller)}</Type>
          </div>
          <IconCaretRight class="size-5 shrink-0 text-muted-foreground" />
        </button>

        <Show when={mode() === "remix"}>
          <Type as="p" variant="caption" class="text-muted-foreground">
            {copy().remixLegalNote}
          </Type>
        </Show>

        <Button class="w-full" onClick={props.onDone} size="lg">
          {copy().done}
        </Button>
      </div>
    </Show>
  );
}

function Field(props: ParentProps<{ label: string }>) {
  return (
    <div class="space-y-2">
      <Type as="div" variant="caption" class="text-muted-foreground">{props.label}</Type>
      {props.children}
    </div>
  );
}
