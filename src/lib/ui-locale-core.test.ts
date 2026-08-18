import { describe, expect, test } from "bun:test";
import {
  resolveDirectionalSide,
  resolveLocaleDirection,
  resolveLocaleLanguageTag,
  resolveRequestLocale,
  resolveRequestUiLocale,
} from "./ui-locale-core";

describe("Solid UI locale resolution", () => {
  test("resolves supported Accept-Language values by quality", () => {
    expect(resolveRequestLocale("en;q=0.4, ar-SA;q=0.9")).toBe("ar");
    expect(resolveRequestLocale("fr, zh-Hans;q=0.8")).toBe("zh");
    expect(resolveRequestLocale("fr-FR")).toBe("en");
  });

  test("lets an explicit locale query override the request header", () => {
    expect(resolveRequestUiLocale(new URL("https://pirate.sc/?locale=zh-CN"), "ar")).toBe("zh");
    expect(resolveRequestUiLocale(new URL("https://pirate.sc/?lang=pseudo"), "ar")).toBe("pseudo");
  });

  test("keeps direction and language tags centralized", () => {
    expect(resolveLocaleDirection("ar")).toBe("rtl");
    expect(resolveLocaleLanguageTag("zh")).toBe("zh-CN");
    expect(resolveDirectionalSide("start", "rtl")).toBe("right");
  });
});
