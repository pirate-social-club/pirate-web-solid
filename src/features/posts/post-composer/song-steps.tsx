// Song steps 2-4 (Lyrics, Rights, Review). Scaffold placeholders: these render
// the step heading and a short note until their content is filled in after the
// step shape is reviewed. Track (step 1) is implemented in song-track-step.tsx.

import { CardContent, Type } from "../../../design-system";
import { cn } from "../../../design-system";
import type { PostComposerController } from "./controller";

function PlaceholderStep(props: {
  controller: PostComposerController;
  title: string;
  note: string;
}) {
  return (
    <CardContent class={cn("space-y-6 p-5", props.controller.isMobile() && "px-0 pb-4 pt-1")}>
      <div class="space-y-1">
        <Type as="h2" variant="h3" class="text-muted-foreground">{props.title}</Type>
        <Type as="p" variant="caption" class="text-muted-foreground">{props.note}</Type>
      </div>
    </CardContent>
  );
}

export function SongLyricsStep(props: { controller: PostComposerController }) {
  return (
    <PlaceholderStep
      controller={props.controller}
      note="Lyrics textarea, the instrumental toggle, and the instrumental/vocal slots land here."
      title="Lyrics"
    />
  );
}

export function SongRightsStep(props: { controller: PostComposerController }) {
  return (
    <PlaceholderStep
      controller={props.controller}
      note="Original or remix with the source picker, then license as three option cards land here."
      title="Rights"
    />
  );
}

export function SongReviewStep(props: { controller: PostComposerController }) {
  return (
    <PlaceholderStep
      controller={props.controller}
      note="A summary of every setting with change affordances, audience, and an add-collaborators link land here."
      title="Review"
    />
  );
}
