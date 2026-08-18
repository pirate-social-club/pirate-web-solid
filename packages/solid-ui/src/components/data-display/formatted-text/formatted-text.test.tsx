import { within } from "@testing-library/dom";
import { createSignal } from "solid-js";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";

import { FormattedText } from "./formatted-text";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("FormattedText", () => {
  it("renders body section headings without document-level h1 elements", () => {
    const container = render(() => (
      <FormattedText
        value={
          "# eZo Festival 2026\nIntro\n\n## Basic info\nBody\n\n### Los Refrescos -- live\nDetails"
        }
      />
    ));

    expect(within(container).getByRole("heading", { level: 2 }).textContent).toContain(
      "eZo Festival 2026",
    );
    expect(within(container).getByRole("heading", { level: 3 }).textContent).toContain(
      "Basic info",
    );
    expect(within(container).getByRole("heading", { level: 4 }).textContent).toContain(
      "Los Refrescos -- live",
    );
    expect(container.querySelector("h1")).toBeNull();
  });

  it("renders inline formatting inside headings", () => {
    const container = render(() => (
      <FormattedText value={"### **Session Victim** -- [RA](https://ra.co)"} />
    ));

    const heading = within(container).getByRole("heading", { level: 4 });
    expect(heading.querySelector("strong")?.textContent).toBe("Session Victim");
    expect(container.querySelector('a[href="https://ra.co"]')).not.toBeNull();
  });

  it("opens links in a new tab without a referrer", () => {
    const container = render(() => (
      <FormattedText value={"See [the docs](https://example.test/docs) for details."} />
    ));

    const link = container.querySelector("a");
    expect(link).toHaveAttribute("href", "https://example.test/docs");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("applies wrapping classes to formatted blocks and links", () => {
    const container = render(() => (
      <FormattedText
        value={[
          "# A very long heading that should never widen the post card",
          "",
          "- [A long linked label that should wrap](https://example.test/really/long/unbroken/path)",
          "",
          "> https://example.test/really/long/unbroken/quote/path",
        ].join("\n")}
      />
    ));

    const text = container.innerHTML;
    expect(text.match(/break-words/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(text.match(/\[overflow-wrap:anywhere\]/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(text).toContain("[word-break:break-word]");
    expect(text).toContain("[word-break:break-all]");
    expect(container.querySelector("a")).not.toBeNull();
    expect(container.querySelector("blockquote")).not.toBeNull();
  });

  it("renders bulleted and numbered lists with inline formatting", () => {
    const container = render(() => (
      <FormattedText
        value={"- first **item**\n- second item\n\n1. step one\n2. step *two*"}
      />
    ));

    const lists = container.querySelectorAll("ul, ol");
    expect(lists.length).toBe(2);
    expect(lists[0].tagName).toBe("UL");
    expect(lists[1].tagName).toBe("OL");
    expect(lists[0].querySelector("strong")?.textContent).toBe("item");
    expect(lists[1].querySelector("em")?.textContent).toBe("two");
  });

  it("renders quotes and strikethrough", () => {
    const container = render(() => (
      <FormattedText value={"> quoted text\n\nnormal ~~struck~~ text"} />
    ));

    expect(container.querySelector("blockquote")?.textContent).toContain("quoted text");
    expect(container.querySelector("s")?.textContent).toBe("struck");
  });

  it("parses nested inline formatting after earlier matches without looping", () => {
    const container = render(() => (
      <FormattedText
        value={
          "Start **bold** middle *italic* end [link](https://example.test) and **nested *deep* bold** done"
        }
      />
    ));

    expect(container.querySelector("strong")?.textContent).toContain("bold");
    expect(container.querySelector("em")?.textContent).toContain("italic");
    expect(container.querySelector("strong em")?.textContent).toBe("deep");
    expect(container.querySelectorAll("a").length).toBe(1);
  });

  it("applies dir and lang attributes to the root", () => {
    const container = render(() => (
      <FormattedText dir="rtl" lang="ar" value="مرحبا" />
    ));

    const root = container.firstElementChild;
    expect(root).toHaveAttribute("dir", "rtl");
    expect(root).toHaveAttribute("lang", "ar");
  });

  it("re-renders when the value changes", () => {
    const [value, setValue] = createSignal("first");
    const container = render(() => <FormattedText value={value()} />);

    expect(within(container).getByText("first")).toBeVisible();

    setValue("## second heading");
    flush();
    expect(within(container).getByRole("heading", { level: 3 })).toBeVisible();
  });

  it("has no axe violations", async () => {
    render(() => (
      <FormattedText
        value={
          "## Title\n\nBody with **bold** and [a link](https://example.test).\n\n- item one\n- item two"
        }
      />
    ));

    await expectNoA11yViolations();
  });
});
