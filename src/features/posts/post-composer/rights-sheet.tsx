// Song rights sheet: the "Access & rights" modal for the song path, reworked
// into a sheet of three summary rows (rights declaration, license, payout)
// with an inline Change editor each, plus a Done footer. Commerce controls
// stay out of the song path in v1; the license and royalty rows remain
// because they are part of SongAuthorInputV1.

import { createSignal, For, Show, type ParentProps } from "solid-js";

import { Button, OptionCard, Type } from "../../../design-system";
import type { PostComposerController } from "./controller";
import { PostComposerDerivativeSection } from "./derivative-section";
import { RoyaltySplitEditor } from "./royalty-split-editor";
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

type Section = "rights" | "license" | "payout" | null;

export function PostComposerRightsSheet(props: {
  controller: PostComposerController;
  initialSection?: Section;
  onDone: () => void;
}) {
  const controller = props.controller;
  const copy = () => controller.copy.rights;
  const [expanded, setExpanded] = createSignal<Section>(props.initialSection ?? null);
  const mode = () => controller.primary.activeSongMode;
  const license = () => controller.license.state.presetId;

  const toggle = (section: Exclude<Section, null>) => {
    setExpanded((current) => (current === section ? null : section));
  };

  const selectLicense = (preset: AssetLicensePresetId) => {
    controller.license.update((current) => ({
      presetId: preset,
      commercialRevSharePct: preset === "commercial-remix"
        ? current.commercialRevSharePct ?? 10
        : undefined,
    }));
    setExpanded(null);
  };

  return (
    <div class="space-y-3 px-4 pb-4 pt-5">
      <SummaryRow
        changeLabel={copy().change}
        doneLabel={copy().done}
        expanded={expanded() === "rights"}
        label={copy().rightsLabel}
        onToggle={() => toggle("rights")}
        value={mode() === "remix" ? copy().remix : copy().original}
      >
        <div class="space-y-2">
          <OptionCard
            onClick={() => controller.primary.handleSongModeChange("original")}
            selected={mode() === "original"}
            title={copy().original}
          />
          <OptionCard
            onClick={() => controller.primary.handleSongModeChange("remix")}
            selected={mode() === "remix"}
            title={copy().remix}
          />
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
        </div>
      </SummaryRow>

      <SummaryRow
        changeLabel={copy().change}
        doneLabel={copy().done}
        expanded={expanded() === "license"}
        label={copy().licenseLabel}
        onToggle={() => toggle("license")}
        value={copy().licenseTitles[license()] ?? license()}
      >
        <div class="space-y-2">
          <For each={licensePresets}>
            {(preset) => (
              <OptionCard
                description={copy().licenseDescriptions[preset]}
                onClick={() => selectLicense(preset)}
                selected={license() === preset}
                title={copy().licenseTitles[preset]}
              />
            )}
          </For>
        </div>
      </SummaryRow>

      <SummaryRow
        changeLabel={copy().change}
        doneLabel={copy().done}
        expanded={expanded() === "payout"}
        label={copy().payoutLabel}
        onToggle={() => toggle("payout")}
        value={payoutSummary(controller)}
      >
        <RoyaltySplitEditor
          addLabel={copy().addCollaborator}
          charityContribution={controller.charity.state}
          charityPartner={controller.charity.partner}
          onChange={(value) => controller.royaltySplit.update(() => value)}
          onCharityContributionChange={controller.charity.update}
          value={controller.royaltySplit.state}
        />
      </SummaryRow>

      <Button class="w-full" onClick={props.onDone} size="lg">
        {copy().done}
      </Button>
    </div>
  );
}

function SummaryRow(props: ParentProps<{
  changeLabel: string;
  doneLabel: string;
  expanded: boolean;
  label: string;
  onToggle: () => void;
  value: string;
}>) {
  return (
    <div class="rounded-[var(--radius-lg)] border border-border-soft bg-card">
      <button
        aria-expanded={props.expanded ? "true" : "false"}
        class="flex w-full items-center justify-between gap-3 px-4 py-3 text-start outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        onClick={props.onToggle}
        type="button"
      >
        <div class="min-w-0 space-y-0.5">
          <Type as="div" variant="caption" class="text-muted-foreground">{props.label}</Type>
          <Type as="div" variant="body-strong" class="truncate">{props.value}</Type>
        </div>
        <Type as="span" variant="label" class="shrink-0 text-primary">
          {props.expanded ? props.doneLabel : props.changeLabel}
        </Type>
      </button>
      <Show when={props.expanded}>
        <div class="border-t border-border-soft p-4">{props.children}</div>
      </Show>
    </div>
  );
}
