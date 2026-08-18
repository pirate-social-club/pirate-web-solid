import { createContext, useContext, type ParentProps } from "solid-js";

import type { UiLocaleCode } from "./ui-locale-core";

// Storybook and future standalone-owned product stories use explicit globals;
// locale state is intentionally in-memory and never persisted in browser
// storage or coupled to authentication.
const UiLocaleContext = createContext<UiLocaleCode>("en");

export function UiLocaleProvider(props: ParentProps<{ locale: UiLocaleCode }>) {
  return <UiLocaleContext value={props.locale}>{props.children}</UiLocaleContext>;
}

export function useUiLocale(): UiLocaleCode {
  return useContext(UiLocaleContext);
}

export type { UiLocaleCode } from "./ui-locale-core";
