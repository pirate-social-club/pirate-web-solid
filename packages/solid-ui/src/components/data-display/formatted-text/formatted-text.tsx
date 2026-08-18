import type { JSX } from "@solidjs/web";
import { Dynamic } from "@solidjs/web";
import { createMemo } from "solid-js";

import { typeVariants } from "@/components/data-display/type/type";
import { cn } from "@/lib/cn";

const formattedTextWrap =
  "min-w-0 max-w-full break-words [overflow-wrap:anywhere] [word-break:break-word]";
const formattedTextLinkWrap = "break-all [word-break:break-all]";

const inlinePattern =
  /(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*\*([\s\S]+?)\*\*\*|\*\*([\s\S]+?)\*\*|\*([\s\S]+?)\*|~~([\s\S]+?)~~)/g;

function renderInline(text: string): JSX.Element[] {
  const nodes: JSX.Element[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(inlinePattern)) {
    const index = match.index ?? 0;

    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index));
    }

    const [, , linkLabel, linkHref, boldItalicText, boldText, italicText, strikeText] =
      match;

    if (linkLabel && linkHref) {
      nodes.push(
        <a
          class={cn(
            formattedTextWrap,
            formattedTextLinkWrap,
            "text-primary-text underline underline-offset-4",
          )}
          href={linkHref}
          rel="noreferrer"
          target="_blank"
        >
          {linkLabel}
        </a>,
      );
    } else if (boldItalicText) {
      nodes.push(
        <strong>
          <em>{renderInline(boldItalicText)}</em>
        </strong>,
      );
    } else if (boldText) {
      nodes.push(<strong>{renderInline(boldText)}</strong>);
    } else if (italicText) {
      nodes.push(<em>{renderInline(italicText)}</em>);
    } else if (strikeText) {
      nodes.push(<s>{renderInline(strikeText)}</s>);
    } else {
      nodes.push(match[0]);
    }

    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function FormattedInline(props: { text: string }) {
  return <>{renderInline(props.text)}</>;
}

function FormattedParagraph(props: { lines: string[] }) {
  const text = () => props.lines.join(" ");
  const isBareUrl = () => /^https?:\/\/\S+$/u.test(text().trim());

  return (
    <p
      class={cn(
        formattedTextWrap,
        "leading-snug text-inherit",
        isBareUrl() && formattedTextLinkWrap,
      )}
    >
      <FormattedInline text={text()} />
    </p>
  );
}

function FormattedHeading(props: { displayDepth: 2 | 3 | 4; text: string }) {
  return (
    <Dynamic
      component={`h${props.displayDepth}`}
      class={cn(
        formattedTextWrap,
        "leading-tight",
        typeVariants({
          variant: props.displayDepth === 4 ? "overline" : "body-strong",
        }),
      )}
    >
      <FormattedInline text={props.text} />
    </Dynamic>
  );
}

function parseBlocks(value: string): JSX.Element[] {
  const lines = value.split("\n");
  const blocks: JSX.Element[] = [];
  let index = 0;

  while (index < lines.length) {
    const trimmed = lines[index]?.trim() ?? "";

    if (!trimmed) {
      index += 1;
      continue;
    }

    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      const markdownDepth = headingMatch[1].length;
      const displayDepth = Math.min(markdownDepth + 1, 4) as 2 | 3 | 4;
      const text = headingMatch[2].trim();
      blocks.push(<FormattedHeading displayDepth={displayDepth} text={text} />);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index]?.trim() ?? "")) {
        quoteLines.push((lines[index] ?? "").trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote
          class={cn(
            formattedTextWrap,
            "border-s-2 border-border-soft ps-4 italic text-muted-foreground",
          )}
        >
          <FormattedParagraph lines={quoteLines} />
        </blockquote>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: JSX.Element[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index]?.trim() ?? "")) {
        const itemLine = (lines[index] ?? "").trim().replace(/^[-*]\s+/, "");
        items.push(
          <li class={formattedTextWrap}>
            <FormattedInline text={itemLine} />
          </li>,
        );
        index += 1;
      }
      blocks.push(
        <ul class={cn(formattedTextWrap, "list-disc space-y-1 ps-6 leading-snug text-inherit")}>
          {items}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: JSX.Element[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index]?.trim() ?? "")) {
        const itemLine = (lines[index] ?? "").trim().replace(/^\d+\.\s+/, "");
        items.push(
          <li class={formattedTextWrap}>
            <FormattedInline text={itemLine} />
          </li>,
        );
        index += 1;
      }
      blocks.push(
        <ol class={cn(formattedTextWrap, "list-decimal space-y-1 ps-6 leading-snug text-inherit")}>
          {items}
        </ol>,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const line = lines[index] ?? "";
      const lineTrimmed = line.trim();
      if (
        !lineTrimmed ||
        /^(#{1,4})\s+(.+)$/.test(lineTrimmed) ||
        /^>\s?/.test(lineTrimmed) ||
        /^[-*]\s+/.test(lineTrimmed) ||
        /^\d+\.\s+/.test(lineTrimmed)
      ) {
        break;
      }
      paragraphLines.push(line);
      index += 1;
    }
    blocks.push(<FormattedParagraph lines={paragraphLines} />);
  }

  return blocks;
}

export interface FormattedTextProps {
  class?: string;
  dir?: "ltr" | "rtl" | "auto";
  lang?: string;
  value: string;
}

/**
 * FormattedText - renders markdown-lite content (headings `#`–`####`, `>`
 * quotes, `-`/`*` and `1.` lists, `**bold**`, `*italic*`, `~~strike~~`, and
 * `[label](https://...)` links) into semantic HTML. Headings start at `h2` so
 * document-level `h1` elements stay outside content. Use it for user-authored
 * post and comment bodies; do not use it for trusted app copy, which should
 * stay plain text.
 */
export function FormattedText(props: FormattedTextProps) {
  const blocks = createMemo(() => parseBlocks(props.value));
  const className = createMemo(() =>
    cn(formattedTextWrap, "space-y-3 text-base", props.class),
  );

  return (
    <div class={className()} dir={props.dir ?? "auto"} lang={props.lang}>
      {blocks()}
    </div>
  );
}
