import { describe, expect, test } from "bun:test";
import { getLocaleMessages, interpolateMessage } from ".";

describe("Solid locale catalogs", () => {
  test("returns typed English, Arabic, and Mandarin namespaces", () => {
    expect(getLocaleMessages("en", "feed").loadMore).toBe("Load more videos");
    expect(getLocaleMessages("ar", "shell").navigation.home).toBe("الرئيسية");
    expect(getLocaleMessages("zh", "routes").notFound.title).toBe("未找到");
  });

  test("pseudo-localizes strings without changing the catalog shape", () => {
    expect(getLocaleMessages("pseudo", "routes").home.title).toStartWith("[!!");
  });

  test("preserves placeholder tokens while pseudo-localizing literal text", () => {
    const message = getLocaleMessages("pseudo", "feed").videoBy;
    const interpolated = interpolateMessage(message, { author: "Ada" });

    expect(message).toContain("{author}");
    expect(interpolated).toContain("Ada");
    expect(interpolated).not.toContain("{author}");
    expect(interpolated).not.toContain("{aauuthoor}");
  });

  test("interpolates known values and preserves unknown placeholders", () => {
    expect(interpolateMessage("@{handle}: {count} / {missing}", { handle: "ada", count: 2 }))
      .toBe("@ada: 2 / {missing}");
  });
});
