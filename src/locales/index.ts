import type { UiLocaleCode } from "../lib/ui-locale-core";
import {
  GENERATED_LOCALE_CATALOGS,
  type GeneratedLocaleCatalogs,
  type LocaleNamespace,
  type RealLocaleCode,
} from "./generated";

export type { LocaleNamespace } from "./generated";

type WidenLocaleMessages<T> = T extends string
  ? string
  : T extends readonly (infer Item)[]
    ? WidenLocaleMessages<Item>[]
    : T extends object
      ? { [Key in keyof T]: WidenLocaleMessages<T[Key]> }
      : T;

type NamespaceMessages<N extends LocaleNamespace> =
  WidenLocaleMessages<GeneratedLocaleCatalogs["en"][N]>;

function pseudoExpand(input: string): string {
  const expanded = input
    .split(/(\{[a-zA-Z][a-zA-Z0-9_]*\})/g)
    .map(segment => /^\{[a-zA-Z][a-zA-Z0-9_]*\}$/.test(segment)
      ? segment
      : segment
        .replace(/a/gi, "aa")
        .replace(/e/gi, "ee")
        .replace(/i/gi, "ii")
        .replace(/o/gi, "oo")
        .replace(/u/gi, "uu"))
    .join("");
  return `[!! ${expanded} ::: ${expanded} !!]`;
}

function pseudoizeValue<T>(value: T): T {
  if (typeof value === "string") return pseudoExpand(value) as T;
  if (Array.isArray(value)) return value.map(pseudoizeValue) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, pseudoizeValue(nested)]),
    ) as T;
  }
  return value;
}

export function getLocaleMessages<N extends LocaleNamespace>(
  locale: UiLocaleCode,
  namespace: N,
): NamespaceMessages<N> {
  if (locale === "pseudo") {
    return pseudoizeValue(GENERATED_LOCALE_CATALOGS.en[namespace]) as NamespaceMessages<N>;
  }
  return GENERATED_LOCALE_CATALOGS[locale as RealLocaleCode][namespace] as NamespaceMessages<N>;
}

export function interpolateMessage(
  message: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return message.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (token, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : token,
  );
}
