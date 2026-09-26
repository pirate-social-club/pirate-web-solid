/** The global create entry's route view: the full-screen video capture flow
 * with destination and profile chosen at review. Nothing here is a community
 * page; the communities the account may post in become review choices. */
import { createMemo, createSignal, Show } from "solid-js";

import {
  loadAccountCommunityMemberships,
  type AccountCommunityMembership,
} from "../../../api/account-community-memberships.ts";
import {
  resolveSession as resolveApplicationSession,
  type SessionResolution,
} from "../../../api/session.ts";
import { requestGlobalSignIn } from "../../auth/global-sign-in-host.tsx";
import { PageContainer } from "@pirate/web-solid-ui";
import { Button, Type } from "../../../design-system";

import type { OriginalVideoCaptureInput, VideoCaptureSession } from "./capture";
import { VideoComposerRuntime, type VideoPostingOption } from "./video-composer-runtime.tsx";
import type { GuidedTakeAlignment } from "./guided-take-alignment";
import type { SongIntervalPreflight } from "./song-reference";
import type { SongSourceReader } from "../post-composer/song-excerpt-source";
import type { SongPickerSource } from "../post-composer/song-picker";
import type { VideoStorage } from "./coordinator";

type RouteState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "anonymous" }>
  | Readonly<{ kind: "error" }>
  | Readonly<{ kind: "ready"; principalId: string; personas: readonly VideoPostingOption[]; communities: readonly VideoPostingOption[] }>;

export function VideoCreateRouteView(props: {
  readonly resolveSession?: () => Promise<SessionResolution>;
  readonly loadMemberships?: () => Promise<readonly AccountCommunityMembership[]>;
  readonly navigate?: (href: string) => void;
  readonly onExit?: () => void;
  /** Story and test seams, passed through to the runtime unchanged. */
  readonly videoSongEligibility?: (input: { readonly communityId: string; readonly postId: string; readonly personaId: string }) => Promise<boolean>;
  readonly videoSongPreflight?: SongIntervalPreflight;
  readonly videoSongReader?: SongSourceReader;
  readonly videoSongPicker?: SongPickerSource;
  readonly videoStorage?: VideoStorage;
  readonly videoOpenPreview?: () => Promise<MediaStream>;
  readonly videoStartCapture?: (input: OriginalVideoCaptureInput) => Promise<VideoCaptureSession>;
  readonly videoAlignTake?: (file: File, offsetMs: number) => Promise<GuidedTakeAlignment>;
}) {
  const resolve = props.resolveSession ?? resolveApplicationSession;
  const loadMemberships = props.loadMemberships ?? (() => loadAccountCommunityMemberships());
  const [state, setState] = createSignal<RouteState>({ kind: "loading" });
  const readyState = createMemo(() => {
    const current = state();
    return current.kind === "ready" ? current : undefined;
  });
  const go = (href: string) => {
    if (props.navigate !== undefined) props.navigate(href);
    else if (typeof window !== "undefined") window.location.assign(href);
  };
  const load = () => {
    setState({ kind: "loading" });
    void resolve().then(
      session => {
        if (session === "anonymous") {
          setState({ kind: "anonymous" });
          return;
        }
        if (session.status !== "authenticated" || "personasUnavailable" in session) {
          setState({ kind: "error" });
          return;
        }
        void loadMemberships().then(
          memberships => setState({
            kind: "ready",
            principalId: session.userId,
            personas: session.personas.map(persona => ({
              id: persona.personaId,
              label: persona.displayName ?? persona.primaryPublicHandle ?? "Profile",
            })),
            communities: memberships
              .filter(membership => membership.membership_status === "member" && membership.can_post === true)
              .map(membership => ({ id: membership.community_id, label: membership.display_name })),
          }),
          () => setState({ kind: "error" }),
        );
      },
      () => setState({ kind: "error" }),
    );
  };
  // The first load runs after setup: a synchronous state write during the
  // component's own render halts the reactive system.
  if (typeof window !== "undefined") queueMicrotask(load);
  return (
    <main data-route-path="/create/video" data-create-state={state().kind}>
      <Show when={state().kind === "loading"}>
        <PageContainer><Type as="p" role="status">Loading the camera…</Type></PageContainer>
      </Show>
      <Show when={state().kind === "anonymous"}>
        <PageContainer class="flex flex-col gap-4">
          <Type as="h1" variant="h1">Post a video</Type>
          <Type as="p">Sign in to post a video.</Type>
          <Button class="w-fit" onClick={requestGlobalSignIn}>Sign in</Button>
        </PageContainer>
      </Show>
      <Show when={state().kind === "error"}>
        <PageContainer class="flex flex-col gap-4">
          <Type as="h1" variant="h1">Post a video</Type>
          <Type as="p" role="alert">We couldn’t load your account. Try again.</Type>
          <Button class="w-fit" onClick={load} variant="secondary">Try again</Button>
        </PageContainer>
      </Show>
      <Show when={readyState()}>
        {ready => (
          <VideoComposerRuntime
            principalId={ready().principalId}
            personaOptions={ready().personas}
            communityOptions={ready().communities}
            onExit={() => (props.onExit ? props.onExit() : go("/"))}
            onPosted={() => go("/")}
            onRetainedPersona={() => undefined}
            readSongEligibility={props.videoSongEligibility}
            songPreflight={props.videoSongPreflight}
            songReader={props.videoSongReader}
            {...(props.videoSongPicker === undefined ? {} : { songPicker: props.videoSongPicker })}
            storage={props.videoStorage}
            openPreview={props.videoOpenPreview}
            startCapture={props.videoStartCapture}
            alignTake={props.videoAlignTake}
          />
        )}
      </Show>
    </main>
  );
}
