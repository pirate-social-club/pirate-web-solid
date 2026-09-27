/** @jsxImportSource @solidjs/web */
import { Title } from "@solidjs/meta";
import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { Type, buttonVariants, cn } from "../../design-system";
import type { LegalDocumentContent } from "./legal-content";

/** Renders a legal document. These routes have no app chrome, so the page carries its own way home. */
export function LegalDocument(props: { readonly document: LegalDocumentContent }): JSX.Element {
  return (
    <main class="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 py-10" data-route-path={props.document.path}>
      <Title>{props.document.title}</Title>
      <header class="flex flex-col gap-3">
        <a class={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit -ms-3")} href="/">Go home</a>
        <Type as="h1" variant="h1">{props.document.title}</Type>
        <Type as="p" variant="caption" class="text-muted-foreground">Last updated {props.document.updated}</Type>
        <Type as="p" variant="body" class="text-muted-foreground">{props.document.summary}</Type>
      </header>
      <For each={props.document.sections}>
        {(section) => (
          <section class="flex flex-col gap-3">
            <Type as="h2" variant="h3">{section.heading}</Type>
            <For each={section.paragraphs ?? []}>{(paragraph) => <Type as="p" variant="body">{paragraph}</Type>}</For>
            <Show when={section.items?.length}>
              <ul class="flex list-disc flex-col gap-2 ps-5">
                <For each={section.items}>{(item) => <li><Type as="span" variant="body">{item}</Type></li>}</For>
              </ul>
            </Show>
          </section>
        )}
      </For>
    </main>
  );
}
