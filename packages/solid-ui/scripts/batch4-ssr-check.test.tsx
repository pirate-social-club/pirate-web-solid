import { renderToString } from "@solidjs/web";
import { describe, expect, it } from "vitest";

import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from "@/components/disclosure/accordion/accordion";
import { FormattedText } from "@/components/data-display/formatted-text/formatted-text";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/data-display/item/item";
import { FormattedTextarea } from "@/patterns/forms/formatted-textarea/formatted-textarea";
import { PirateBrandMark } from "@/patterns/identity/pirate-brand-mark/pirate-brand-mark";

function renderHtml(ui: () => unknown): string {
  return renderToString(() => <>{ui()}</>);
}

describe("Batch 4 SSR smoke", () => {
  it("renders Accordion without browser APIs", () => {
    expect(
      renderHtml(() => (
        <Accordion defaultValue={["item-1"]}>
          <AccordionItem value="item-1">
            <AccordionHeader>
              <AccordionTrigger>What is Pirate?</AccordionTrigger>
            </AccordionHeader>
            <AccordionContent>Pirate is community-first.</AccordionContent>
          </AccordionItem>
        </Accordion>
      )),
    ).toContain("What is Pirate?");
  });

  it("renders Item without browser APIs", () => {
    expect(
      renderHtml(() => (
        <Item>
          <ItemContent>
            <ItemTitle>Song Title</ItemTitle>
            <ItemDescription>Artist name</ItemDescription>
          </ItemContent>
        </Item>
      )),
    ).toContain("Song Title");
  });

  it("renders FormattedText without browser APIs", () => {
    const html = renderHtml(() => (
      <FormattedText value={"## Title\n\nBody with **bold** and [a link](https://example.test)."} />
    ));
    expect(html).toContain("<h3");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('href="https://example.test"');
  });

  it("renders FormattedTextarea without browser APIs", () => {
    const html = renderHtml(() => (
      <FormattedTextarea placeholder="Write a reply..." value="seed" />
    ));
    expect(html).toContain('aria-label="Bold"');
    expect(html).toContain("seed");
  });

  it("renders PirateBrandMark without browser APIs", () => {
    const html = renderHtml(() => <PirateBrandMark decorative={false} />);
    expect(html).toContain('alt="Pirate"');
    expect(html).toContain("logo_ghost_sm.png");
  });
});
