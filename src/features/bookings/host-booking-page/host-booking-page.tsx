import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { Avatar, Button, Card, CardContent, Separator, Type, cn } from "../../../design-system";
import { formatCentsAsUsdc } from "../booking-format";

export interface HostBookingPageProps {
  name: string;
  bio: string;
  topics: string[];
  photoSrc?: string | null;
  introVideoSrc?: string;
  basePriceCents: number;
  availabilityPreview?: JSX.Element;
  onBookSession?: () => void;
  class?: string;
}

export function HostBookingPage(props: HostBookingPageProps) {
  return (
    <div class={cn("flex flex-col gap-6", props.class)} data-host-booking-page>
      <Card><CardContent class="flex flex-col gap-4 p-6">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start"><Avatar fallback={props.name} size="lg" src={props.photoSrc ?? undefined} /><div class="flex flex-col gap-2"><Type as="h1" variant="h2">{props.name}</Type><Type variant="caption">{formatCentsAsUsdc(props.basePriceCents)} per session</Type></div></div>
        <Separator />
        <div class="flex flex-col gap-2"><Type variant="label">About</Type><Type variant="body">{props.bio}</Type></div>
        <Show when={props.topics.length > 0}><div class="flex flex-col gap-2"><Type variant="label">Topics</Type><div class="flex flex-wrap gap-2"><For each={props.topics}>{(topic) => <Type as="span" variant="body" class="rounded-[var(--radius-md)] border border-border-soft bg-surface-skeleton px-3 py-1">{topic}</Type>}</For></div></div></Show>
        <Show when={props.introVideoSrc}><div class="flex flex-col gap-2"><Type variant="label">Intro video</Type><video aria-label={`Intro video from ${props.name}`} class="aspect-video w-full rounded-[var(--radius-md)] border border-border-soft bg-foreground" controls preload="metadata" src={props.introVideoSrc} /></div></Show>
      </CardContent></Card>
      <Show when={props.availabilityPreview}><div class="flex flex-col gap-3"><Type as="h2" variant="h3">Availability</Type>{props.availabilityPreview}</div></Show>
      <div class="sticky bottom-4 z-10 flex justify-center sm:static sm:z-auto"><Button class="w-full sm:w-auto" onClick={props.onBookSession} size="lg">Book a session</Button></div>
    </div>
  );
}
