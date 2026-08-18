import type { Preview } from "storybook-solidjs-vite";
import { createDecorator } from "storybook-solidjs-vite";

import {
  UiLocaleProvider,
  type UiLocaleCode,
} from "../src/lib/ui-locale";
import {
  resolveLocaleDirection,
  resolveLocaleLanguageTag,
} from "../src/lib/ui-locale-core";

import "../src/index.css";

type ThemeMode = "dark" | "light" | "system";
type DirectionMode = "auto" | "ltr" | "rtl";

const withStandaloneEnvironment = createDecorator((Story, context) => {
  const mode = context.globals.theme as ThemeMode;
  const directionMode = context.globals.direction as DirectionMode;
  const locale = context.globals.locale as UiLocaleCode;
  const root = document.documentElement;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const useDark = mode === "dark" || (mode === "system" && prefersDark);
  const direction =
    directionMode === "auto" ? resolveLocaleDirection(locale) : directionMode;

  root.classList.toggle("light", !useDark);
  root.dataset.theme = useDark ? "dark" : "light";
  root.dir = direction;
  root.lang = resolveLocaleLanguageTag(locale);

  return (
    <UiLocaleProvider locale={locale}>
      {Story()}
    </UiLocaleProvider>
  );
});

const preview: Preview = {
  decorators: [withStandaloneEnvironment],
  globalTypes: {
    theme: {
      name: "Theme",
      description: "Standalone app theme",
      defaultValue: "dark",
      toolbar: {
        icon: "mirror",
        items: [
          { value: "dark", title: "Dark" },
          { value: "light", title: "Light" },
          { value: "system", title: "System" },
        ],
      },
    },
    direction: {
      name: "Direction",
      description: "Global text direction",
      defaultValue: "auto",
      toolbar: {
        icon: "transfer",
        items: [
          { value: "auto", title: "Auto" },
          { value: "ltr", title: "LTR" },
          { value: "rtl", title: "RTL" },
        ],
      },
    },
    locale: {
      name: "Locale",
      description: "Global story locale",
      defaultValue: "en",
      toolbar: {
        icon: "globe",
        items: [
          { value: "en", title: "English" },
          { value: "ar", title: "Arabic" },
          { value: "zh", title: "Chinese" },
          { value: "pseudo", title: "Pseudo" },
        ],
      },
    },
  },
  initialGlobals: {
    theme: "dark",
    direction: "auto",
    locale: "en",
  },
  parameters: {
    a11y: {
      test: "error",
    },
    backgrounds: {
      default: "app-bg",
      values: [
        { name: "app-bg", value: "oklch(0.18 0 0)" },
        { name: "dark", value: "#09090b" },
        { name: "light", value: "#ffffff" },
      ],
    },
    layout: "centered",
    options: {
      storySort: {
        order: ["App", "Foundations"],
      },
    },
  },
};

export default preview;
