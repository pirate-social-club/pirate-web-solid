import { SongActivitySignIn, type readSongActivityPreview } from "../activity/song-activity-sign-in.tsx";

import {
  LoadingIndicator,
  Button,
  Type,
} from "../../design-system";

export interface StudyRouteLoadingStateProps {
  label?: string;
}

export function StudyRouteLoadingState(props: StudyRouteLoadingStateProps) {
  return (
    <LoadingIndicator label={props.label} variant="page" />
  );
}

export interface StudyRouteLoadFailureStateProps {
  description: string;
  onGoHome?: () => void;
  onRetry?: () => void;
  title: string;
}

export function StudyRouteLoadFailureState(props: StudyRouteLoadFailureStateProps) {
  return (
    <section class="flex h-dvh w-full items-center justify-center bg-background px-5 text-foreground">
      <div class="flex w-full max-w-[350px] flex-col items-center text-center">
        <Type as="h1" class="text-xl" variant="h4">
          {props.title}
        </Type>
        <Type as="p" class="mt-3 text-muted-foreground" variant="body">
          {props.description}
        </Type>
        <div class="mt-5 flex w-full gap-3">
          <Button class="h-13 flex-1" onClick={() => props.onRetry?.()} size="lg">
            Try Again
          </Button>
          <Button
            class="h-13 flex-1 bg-transparent"
            onClick={() => props.onGoHome?.()}
            size="lg"
            variant="outline"
          >
            Go Home
          </Button>
        </div>
      </div>
    </section>
  );
}

export interface StudyAuthRequiredStateProps {
  postId?: string;
  readPreview?: typeof readSongActivityPreview;
  onConnect?: () => void;
  onExit?: () => void;
}

export function StudyAuthRequiredState(props: StudyAuthRequiredStateProps) {
  return <SongActivitySignIn activity="study" postId={props.postId} readPreview={props.readPreview} onConnect={props.onConnect} onExit={props.onExit} />;
}
