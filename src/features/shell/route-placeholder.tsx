import { Title } from "@solidjs/meta";

import { Card, CardContent, Type, buttonVariants, cn } from "../../design-system";

export interface RoutePlaceholderProps {
  readonly path: string;
  readonly title: string;
  readonly description: string;
}

/** An honest page for a destination that does not exist yet, with a way home. */
export function RoutePlaceholder(props: RoutePlaceholderProps) {
  return (
    <main data-route-path={props.path} class="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-5xl items-center justify-center px-4 py-8 md:px-8">
        <Title>{props.title}</Title>
        <Card class="w-full max-w-xl">
          <CardContent class="flex flex-col gap-3 p-6 md:p-8">
            <Type as="h1" variant="h1">{props.title}</Type>
            <Type as="p" variant="body" class="text-muted-foreground">{props.description}</Type>
            <a class={cn(buttonVariants({ variant: "secondary" }), "mt-2 w-fit")} href="/">Go home</a>
          </CardContent>
        </Card>
    </main>
  );
}
