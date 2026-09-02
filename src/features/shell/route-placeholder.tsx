import { Title } from "@solidjs/meta";

import { Card, CardContent, Type } from "../../design-system";

export interface RoutePlaceholderProps {
  readonly path: string;
  readonly title: string;
  readonly description: string;
}

export function RoutePlaceholder(props: RoutePlaceholderProps) {
  return (
    <main data-route-path={props.path} class="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-5xl items-center justify-center px-4 py-8 md:px-8">
        <Title>{props.title} · Pirate</Title>
        <Card class="w-full max-w-xl">
          <CardContent class="flex flex-col gap-3 p-6 md:p-8">
            <Type as="p" variant="label" class="text-muted-foreground">{props.path}</Type>
            <Type as="h1" variant="h1">{props.title}</Type>
            <Type as="p" variant="body" class="text-muted-foreground">{props.description}</Type>
            <Type as="p" variant="caption">This route is scaffolded and ready for its feature lane.</Type>
          </CardContent>
        </Card>
    </main>
  );
}
