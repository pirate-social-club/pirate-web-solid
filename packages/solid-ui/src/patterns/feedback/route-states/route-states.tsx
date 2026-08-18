import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { Button } from "@/components/actions/button/button";
import { Spinner } from "@/components/feedback/spinner/spinner";
import { Type } from "@/components/data-display/type/type";
import { PageContainer } from "@/patterns/layout/layout-shell/layout-shell";
import {
  IllustratedState,
  type IllustratedStateImage,
} from "@/patterns/feedback/illustrated-state/illustrated-state";
import { StackPageShell } from "@/patterns/layout/stack-page-shell/stack-page-shell";
import { StatusCard } from "@/patterns/feedback/status-card/status-card";

/** App mascot artwork paths, overridable for offline surfaces. */
const DEFAULT_ERROR_IMAGE: IllustratedStateImage = {
  alt: "Confused pirate ghost",
  src: "/mascots/error-ghost-256.png",
  srcSet: "/mascots/error-ghost-512.webp 2x, /mascots/error-ghost-256.webp 1x",
};

const DEFAULT_EMPTY_INBOX_IMAGE: IllustratedStateImage = {
  alt: "Friendly pirate ghost checking an empty mailbox",
  src: "/mascots/empty-inbox-ghost-256.png",
  srcSet: "/mascots/empty-inbox-ghost-512.webp 2x, /mascots/empty-inbox-ghost-256.webp 1x",
};

export function FullPageSpinner() {
  return (
    <section class="flex min-w-0 flex-1 items-center justify-center py-20">
      <div class="flex items-center justify-center py-20">
        <Spinner class="size-6" />
      </div>
    </section>
  );
}

export interface RouteLoadingStateProps {
  height?: "route" | "public";
  label?: string;
}

export function RouteLoadingState(props: RouteLoadingStateProps) {
  const isPublic = () => props.height === "public";
  return (
    <div
      aria-busy="true"
      aria-label={props.label ?? "Loading"}
      class={`flex ${isPublic() ? "min-h-[60vh]" : "min-h-[40vh]"} w-full flex-1 items-center justify-center`}
      role="status"
    >
      <Spinner class="size-6" decorative />
    </div>
  );
}

export interface RouteMessageStateProps {
  description: string;
  title: string;
}

export function RouteMessageState(props: RouteMessageStateProps) {
  return (
    <div class="flex min-h-[60vh] w-full flex-1 items-start justify-start px-1 py-8 md:px-6 md:py-12">
      <div class="w-full max-w-2xl">
        <Type as="h1" variant="h2">{props.title}</Type>
        <Type as="p" class="mt-3 text-muted-foreground" variant="body">{props.description}</Type>
      </div>
    </div>
  );
}

export function EmptyFeedState(props: { message: string }) {
  return (
    <div class="px-1 py-4 md:px-0">
      <Type as="p" variant="body" class="text-muted-foreground">{props.message}</Type>
    </div>
  );
}

export interface ErrorStateProps {
  action?: JSX.Element;
  class?: string;
  description?: string;
  image?: IllustratedStateImage;
  title?: string;
}

export function ErrorState(props: ErrorStateProps) {
  return (
    <IllustratedState
      action={props.action}
      class={props.class}
      description={props.description}
      image={props.image ?? DEFAULT_ERROR_IMAGE}
      title={props.title}
    />
  );
}

export interface EmptyInboxStateProps {
  class?: string;
  description?: string;
  image?: IllustratedStateImage;
  title?: string;
}

export function EmptyInboxState(props: EmptyInboxStateProps) {
  return (
    <IllustratedState
      class={props.class}
      description={props.description}
      image={props.image ?? DEFAULT_EMPTY_INBOX_IMAGE}
      title={props.title}
    />
  );
}

export interface RouteLoadFailureStateProps {
  description: string;
  title: string;
  goHomeLabel?: string;
  retryLabel?: string;
  onGoHome?: () => void;
  onRetry?: () => void;
}

export function RouteLoadFailureState(props: RouteLoadFailureStateProps) {
  return (
    <section class="flex min-w-0 flex-1 flex-col justify-center">
      <div class="mx-auto w-full max-w-3xl px-1 py-2 md:px-6 md:py-8">
        <ErrorState
          action={
            <div class="flex w-full flex-row gap-3">
              <Button class="h-12 flex-1" onClick={() => props.onRetry?.()} size="lg">
                {props.retryLabel ?? "Try Again"}
              </Button>
              <Button
                class="h-12 flex-1"
                onClick={() => props.onGoHome?.()}
                size="lg"
                variant="secondary"
              >
                {props.goHomeLabel ?? "Go Home"}
              </Button>
            </div>
          }
          description={props.description}
          title={props.title}
        />
      </div>
    </section>
  );
}

export interface RootAppErrorStateProps {
  description: string;
  title: string;
  homeLabel?: string;
  onGoHome?: () => void;
}

export function RootAppErrorState(props: RootAppErrorStateProps) {
  return (
    <main class="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <ErrorState
        action={
          <Button
            class="h-12 w-full"
            onClick={() => props.onGoHome?.()}
            size="lg"
            variant="secondary"
          >
            {props.homeLabel ?? "Go Home"}
          </Button>
        }
        description={props.description}
        title={props.title}
      />
    </main>
  );
}

export interface NotFoundRouteStateProps {
  path: string;
  title?: string;
  /** Defaults to an English message interpolating the missing path. */
  description?: string;
  homeLabel?: string;
  onGoHome?: () => void;
}

export function NotFoundRouteState(props: NotFoundRouteStateProps) {
  const description = () =>
    props.description ?? `We could not find ${props.path}. It may have moved or never existed.`;

  return (
    <section class="flex min-w-0 flex-1 flex-col justify-center">
      <div class="mx-auto w-full max-w-3xl px-1 py-2 md:px-6 md:py-8">
        <ErrorState
          action={
            <Button
              class="h-12 w-full"
              onClick={() => props.onGoHome?.()}
              size="lg"
              variant="secondary"
            >
              {props.homeLabel ?? "Back to home"}
            </Button>
          }
          description={description()}
          title={props.title ?? "Page not found"}
        />
      </div>
    </section>
  );
}

export interface AuthRequiredRouteStateProps {
  title: string;
  description: string;
  /** Auth runtime state, host-resolved: loading shows a spinner, unavailable
      shows a warning card, ready shows the sign-in surface. */
  authState?: "loading" | "unavailable" | "ready";
  busy?: boolean;
  ctaLabel?: string;
  headline?: string;
  hideTitleOnMobile?: boolean;
  illustration?: JSX.Element;
  onConnect?: () => void;
  signInLabel?: string;
  unavailableTitle?: string;
}

/**
 * Sign-in gate for routes that require an account. The React version read
 * the Privy runtime directly; here the host resolves auth into authState and
 * onConnect so the screen stays callback-driven and offline-renderable.
 */
export function AuthRequiredRouteState(props: AuthRequiredRouteStateProps) {
  const authState = () => props.authState ?? "ready";

  return (
    <Show
      when={authState() !== "loading"}
      fallback={<FullPageSpinner />}
    >
      <PageContainer class="min-w-0 flex-1">
        <StackPageShell
          headerVariant="plain"
          hideTitleOnMobile={props.hideTitleOnMobile}
          title={props.title}
        >
          <Show
            when={authState() === "ready"}
            fallback={
              <StatusCard
                title={props.unavailableTitle ?? "Authentication unavailable"}
                description={`${props.description} Check the console for auth loader errors.`}
                flatOnMobile
                tone="warning"
              />
            }
          >
            <Show
              when={props.illustration}
              fallback={
                <StatusCard
                  title={props.signInLabel ?? "Sign in"}
                  description={props.description}
                  flatOnMobile
                  tone="warning"
                  actions={
                    props.onConnect ? (
                      <Button loading={props.busy} onClick={() => props.onConnect?.()}>
                        {props.signInLabel ?? "Sign in"}
                      </Button>
                    ) : undefined
                  }
                />
              }
            >
              <div class="flex flex-1 flex-col items-center justify-center gap-8 px-5 py-10">
                {props.illustration}
                <div class="flex w-full max-w-sm flex-col items-center gap-4 text-center">
                  <Type as="h2" variant="h2">
                    {props.headline ?? props.title}
                  </Type>
                  <Type as="p" variant="body" class="max-w-xs text-muted-foreground">
                    {props.description}
                  </Type>
                  <Show when={props.onConnect}>
                    <Button
                      class="mt-1 h-12 w-full"
                      loading={props.busy}
                      onClick={() => props.onConnect?.()}
                      size="lg"
                    >
                      {props.ctaLabel ?? "Connect"}
                    </Button>
                  </Show>
                </div>
              </div>
            </Show>
          </Show>
        </StackPageShell>
      </PageContainer>
    </Show>
  );
}
