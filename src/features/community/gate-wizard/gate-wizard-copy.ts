import { getLocaleMessages } from "../../../locales";
import type { UiLocaleCode } from "../../../lib/ui-locale-core";

function gateWizardCopy(locale: UiLocaleCode) {
  return getLocaleMessages(locale, "creation").gateWizard;
}

export type GateWizardCopy = ReturnType<typeof gateWizardCopy>;

export function createGateWizardCopyAccessor(locale: () => UiLocaleCode): () => GateWizardCopy {
  return () => gateWizardCopy(locale());
}
