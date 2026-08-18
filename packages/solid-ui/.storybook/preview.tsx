import type { Preview } from "storybook-solidjs-vite";
import { createDecorator } from "storybook-solidjs-vite";
import { DocsRenderer } from "@storybook/addon-docs";
import { create } from "storybook/theming/create";

import "../src/index.css";

type ThemeMode = "dark" | "light" | "system";
type DirectionMode = "auto" | "ltr" | "rtl";
type LocaleCode = "en" | "ar" | "pseudo";

const fontSans =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Noto Sans Arabic", "Noto Sans Hebrew", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';
const fontMono =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

const createDocsTheme = (base: "dark" | "light") => {
  const isDark = base === "dark";
  return create({
    base,
    fontBase: fontSans,
    fontCode: fontMono,
    appBg: isDark ? "#121212" : "#f7f8fa",
    appContentBg: isDark ? "#1b1b1b" : "#ffffff",
    appPreviewBg: isDark ? "#121212" : "#f7f8fa",
    appBorderColor: isDark ? "#2c2e30" : "#d5d8db",
    appBorderRadius: 8,
    textColor: isDark ? "#d2d4d7" : "#15191d",
    textMutedColor: isDark ? "#8b9095" : "#6d7277",
    textInverseColor: isDark ? "#15191d" : "#d2d4d7",
    barBg: isDark ? "#1b1b1b" : "#ffffff",
    barTextColor: isDark ? "#8b9095" : "#6d7277",
    barSelectedColor: isDark ? "#f66e5e" : "#b3241b",
    inputBg: isDark ? "#1b1b1b" : "#ffffff",
    inputBorder: isDark ? "#2c2e30" : "#d5d8db",
    inputTextColor: isDark ? "#d2d4d7" : "#15191d",
    inputBorderRadius: 6,
    colorPrimary: isDark ? "#cc291f" : "#c1291f",
    colorSecondary: isDark ? "#8b9095" : "#6d7277",
  });
};

const docsThemeDark = createDocsTheme("dark");
const docsThemeLight = createDocsTheme("light");

const localeDirection: Record<LocaleCode, "ltr" | "rtl"> = {
  en: "ltr",
  ar: "rtl",
  pseudo: "ltr",
};

const localeLanguageTag: Record<LocaleCode, string> = {
  en: "en",
  ar: "ar",
  pseudo: "en",
};

const withDocumentAttributes = createDecorator((Story, context) => {
  const mode = context.globals.theme as ThemeMode;
  const directionMode = context.globals.direction as DirectionMode;
  const locale = context.globals.locale as LocaleCode;
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const useDark = mode === "dark" || (mode === "system" && prefersDark);
  const direction =
    directionMode === "auto" ? localeDirection[locale] : directionMode;

  root.classList.toggle("light", !useDark);
  root.dataset.theme = mode;
  root.dir = direction;
  root.lang = localeLanguageTag[locale];

  return Story();
});

class ThemedDocsRenderer extends DocsRenderer {
  constructor() {
    super();
    const parentRender = this.render;
    this.render = async (
      context: Parameters<DocsRenderer["render"]>[0],
      docsParameter: Parameters<DocsRenderer["render"]>[1],
      element: Parameters<DocsRenderer["render"]>[2],
    ) => {
      const globals: Record<string, unknown> =
        (context as { globals?: Record<string, unknown> }).globals ??
        (context as {
          store?: { userGlobals?: { globals?: Record<string, unknown> } };
        }).store?.userGlobals?.globals ??
        {};
      const mode = (globals.theme as ThemeMode | undefined) ?? "dark";
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const useDark = mode === "dark" || (mode === "system" && prefersDark);
      docsParameter.theme = useDark ? docsThemeDark : docsThemeLight;
      return parentRender(context, docsParameter, element);
    };
  }
}

const preview: Preview = {
  decorators: [withDocumentAttributes],
  globalTypes: {
    theme: {
      name: "Theme",
      description: "Global app theme",
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
    docs: {
      renderer: () => new ThemedDocsRenderer(),
    },
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
        order: [
          "Foundations",
          ["Color", "Typography", "Spacing & Sizing", "Radius & Elevation", "Icons", "Motion"],
          "Components",
          ["Actions", "Forms", "Overlays", "Disclosure", "Feedback", "Data Display", "Media"],
          "Patterns",
          ["Forms", "Overlays", "Feedback", "Identity", "Engagement", "Layout", "Navigation"],
        ],
      },
    },
  },
};

export default preview;
