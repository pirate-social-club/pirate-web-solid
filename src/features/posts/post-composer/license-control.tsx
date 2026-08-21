// License chip: one question, one sheet. Mirrors the visibility chip — a pill
// trigger opens a sheet of three OptionCards; selecting one closes the sheet.
// Default preset is non-commercial.

import { For, createSignal } from "solid-js";

import {
  IconCaretDown,
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
  OptionCard,
  Type,
  pillButtonVariants,
} from "../../../design-system";
import { cn } from "../../../design-system";
import type { PostComposerController } from "./controller";
import type { AssetLicensePresetId } from "./types";

const licensePresets: AssetLicensePresetId[] = [
  "non-commercial",
  "commercial-use",
  "commercial-remix",
];

export function PostComposerLicenseControl(props: {
  controller: PostComposerController;
  initialOpen?: boolean;
}) {
  const controller = props.controller;
  const [open, setOpen] = createSignal(props.initialOpen ?? false);
  const license = () => controller.license.state.presetId;
  const chipLabel = () =>
    controller.copy.rights.licenseChipLabels[license()] ?? license();

  const selectLicense = (preset: AssetLicensePresetId) => {
    controller.license.update((current) => ({
      presetId: preset,
      commercialRevSharePct: preset === "commercial-remix"
        ? current.commercialRevSharePct ?? 10
        : undefined,
    }));
    setOpen(false);
  };

  return (
    <Modal open={open()} onOpenChange={setOpen}>
      <ModalTrigger
        aria-label={`${controller.copy.rights.licenseSheetTitle}: ${chipLabel()}`}
        class={cn(pillButtonVariants({ tone: "default" }), "h-11 min-w-0 gap-2 px-3.5 text-foreground")}
      >
        <Type as="span" variant="label" class="truncate">{chipLabel()}</Type>
        <IconCaretDown class="size-4 shrink-0 text-muted-foreground" />
      </ModalTrigger>
      <ModalContent
        class="max-h-[88dvh] overflow-y-auto rounded-t-[var(--radius-3xl)] px-0 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:rounded-[var(--radius-xl)] sm:pb-6 sm:pt-6"
        mobileSide="bottom"
      >
        <div aria-hidden="true" class="mx-auto mb-4 h-1 w-12 rounded-full bg-muted sm:hidden" />
        <ModalHeader class="px-4 pe-12 text-start">
          <ModalTitle>{controller.copy.rights.licenseSheetTitle}</ModalTitle>
        </ModalHeader>
        <div class="space-y-2 px-4 pt-5">
          <For each={licensePresets}>
            {(preset) => (
              <OptionCard
                onClick={() => selectLicense(preset)}
                selected={license() === preset}
                title={controller.copy.rights.licenseTitles[preset]}
              />
            )}
          </For>
        </div>
      </ModalContent>
    </Modal>
  );
}
