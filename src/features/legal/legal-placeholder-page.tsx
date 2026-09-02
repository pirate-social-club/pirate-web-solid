/** @jsxImportSource @solidjs/web */
import { Title } from "@solidjs/meta";
import type { JSX } from "@solidjs/web";

import { Card, CardContent, Type, buttonVariants, cn } from "../../design-system";

export interface LegalPlaceholderPageProps {
  readonly path: "/terms" | "/privacy";
  readonly title: "Terms" | "Privacy Policy";
}

/** Public placeholder shell. Approved legal copy replaces this component. */
export function LegalPlaceholderPage(props: LegalPlaceholderPageProps): JSX.Element {
  return (
    <main
      class="mx-auto flex min-h-screen w-full max-w-3xl items-center px-5 py-10"
      data-route-path={props.path}
    >
      <Title>{props.title} · Pirate</Title>
      <Card class="w-full">
        <CardContent class="flex flex-col gap-4 p-6 md:p-8">
          <Type as="p" variant="label" class="text-muted-foreground">Pre-live placeholder</Type>
          <Type as="h1" variant="h1">{props.title}</Type>
          <Type as="p" variant="body" class="text-muted-foreground">
            Approved legal copy has not been published yet. This page is a replaceable placeholder and does not state product terms or privacy commitments.
          </Type>
          <a class={cn(buttonVariants({ variant: "outline" }), "mt-2 w-fit")} href="/auth/sign-in">
            Back to sign in
          </a>
        </CardContent>
      </Card>
    </main>
  );
}
