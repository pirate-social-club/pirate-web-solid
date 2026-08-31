import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import {
  Button,
  IconButton,
  IconCaretLeft,
  Spinner,
  Type,
} from "../../design-system";

interface StudyRouteShellProps {
  children: JSX.Element;
  onExit?: () => void;
  title: string;
}

/** Shared mobile frame for route states that still belong to a study session. */
function StudyRouteShell(props: StudyRouteShellProps) {
  return (
    <main class="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
      <header class="flex h-14 shrink-0 items-center gap-3 border-b border-border-soft px-4">
        <IconButton
          aria-label="Exit study"
          class="size-10 bg-secondary"
          onClick={props.onExit}
          variant="secondary"
        >
          <IconCaretLeft class="size-5" />
        </IconButton>
        <Type as="h1" class="text-lg" variant="h4">
          {props.title}
        </Type>
      </header>
      {props.children}
    </main>
  );
}

export interface StudyRouteLoadingStateProps {
  label?: string;
}

export function StudyRouteLoadingState(props: StudyRouteLoadingStateProps) {
  return (
    <div
      aria-busy="true"
      aria-label={props.label ?? "Loading"}
      class="grid h-dvh w-full place-items-center bg-background text-foreground"
      role="status"
    >
      <Spinner class="size-6 text-muted-foreground" decorative />
    </div>
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
    <main class="flex h-dvh w-full items-center justify-center bg-background px-5 text-foreground">
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
    </main>
  );
}

export interface StudyAuthRequiredStateProps {
  ctaLabel?: string;
  description: string;
  onConnect?: () => void;
  onConnectIntent?: () => void;
  onExit?: () => void;
  title: string;
}

export function StudyAuthRequiredState(props: StudyAuthRequiredStateProps) {
  return (
    <StudyRouteShell onExit={props.onExit} title={props.title}>
      <div class="flex min-h-0 flex-1 flex-col px-5 pt-6">
        <Type as="h2" class="text-base" variant="body-strong">
          Sign in
        </Type>
        <Type as="p" class="mt-1 max-w-[350px] text-[15px] leading-5 text-muted-foreground" variant="body">
          {props.description}
        </Type>
        <Show when={props.onConnect}>
          <Button class="mt-4 h-11 w-[120px]" onClick={() => props.onConnect?.()} onFocus={props.onConnectIntent} onPointerDown={props.onConnectIntent}>
            {props.ctaLabel ?? "Sign in"}
          </Button>
        </Show>
      </div>
    </StudyRouteShell>
  );
}
