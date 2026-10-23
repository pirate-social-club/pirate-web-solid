import { EngagementControls } from "../shared-engagement/engagement-controls.tsx";
import type { ContentAction } from "../shared-engagement/content-overflow-menu.tsx";
import type { JSX } from "@solidjs/web";
import { createSignal, onCleanup, onSettled, Show } from "solid-js";
import { resolveSession, type AuthenticatedSession, type SessionResolution } from "../../../api/session";
import { createCommunityViewerVoteClient, loadViewerVote, type ViewerVote } from "../../communities/community-page/community-viewer-vote-api";
import { communityOperationPersonas, defaultOperationPersonaId, toOperationPersonas } from "../../identity/community-persona-choice";
import { OperationPersonaControl } from "../../identity/operation-persona-control/operation-persona-control";
import { requestGlobalSignIn } from "../../auth/global-sign-in-host";
import { Button } from "../../../design-system";
import { PostEngagement, type PostEngagementPost } from "../post-engagement/post-engagement";
import type { PostEngagementTransport } from "../post-engagement/post-engagement-api";
import type { CommentThreadReader } from "../post-engagement/comment-thread-api";
import type { PendingEngagementStorage } from "../post-engagement/post-engagement-pending";
import type { CommentNavigation, CommentNavigationReader } from "../../notifications/comment-navigation-api.ts";
import { useTargetedPersona } from "../../notifications/targeted-persona-context.ts";

export interface PublicPostEngagementDependencies {
  readonly resolveSession?: () => Promise<SessionResolution>;
  readonly readViewerVote?: (postId: string) => Promise<ViewerVote>;
  readonly transport?: PostEngagementTransport;
  readonly readComments?: CommentThreadReader;
  readonly pendingStorage?: PendingEngagementStorage;
  readonly readTarget?: CommentNavigationReader;
}

/** Public content renders immediately; private controls wait for the viewer's own vote. */
export function PublicPostEngagement(props: {
  post: Omit<PostEngagementPost, "viewerVote">;
  communityId: string;
  canReportPost?: boolean;
  /** Compact lists use the pills to request sign-in without another button per card. */
  showSignInPrompt?: boolean;
  dependencies?: PublicPostEngagementDependencies;
  /** `inline` is the post page: the thread under the post and a bottom comment bar. */
  presentation?: "sheet" | "inline";
  newestFirstRoots?: boolean;
  /** Inline only: a signed-in visitor who is not a member joins here to comment. */
  joinHref?: string;
  target?: CommentNavigation;
  children: (controls?: JSX.Element, menuActions?: readonly ContentAction[], viewer?: AuthenticatedSession) => JSX.Element;
}) {
  const inline = () => props.presentation === "inline";
  const targetedPersona = useTargetedPersona();
  const [session, setSession] = createSignal<AuthenticatedSession>();
  const [anonymous, setAnonymous] = createSignal(false);
  const [issue, setIssue] = createSignal(false);
  const [vote, setVote] = createSignal<{ value: ViewerVote }>();
  const [personaId, setPersonaId] = createSignal<string>();
  const personas = () => communityOperationPersonas(session()?.personas ?? [], props.communityId);
  let active = true;
  onCleanup(() => { active = false; });
  const readVote = async () => {
    setIssue(false);
    try {
      const value = await (props.dependencies?.readViewerVote
        ? props.dependencies.readViewerVote(props.post.id)
        : loadViewerVote({ client: createCommunityViewerVoteClient(), postId: props.post.id }));
      if (active) setVote({ value });
    } catch {
      if (active) setIssue(true);
    }
  };
  onSettled(() => {
    void (props.dependencies?.resolveSession ?? resolveSession)().then(async resolved => {
      if (!active) return;
      if (resolved === "anonymous") { setAnonymous(true); return; }
      setSession(resolved);
      const available = communityOperationPersonas(resolved.personas, props.communityId), selected = targetedPersona?.selected();
      setPersonaId(selected && available.some(persona => persona.personaId === selected) ? selected : defaultOperationPersonaId(available));
      await readVote();
    }, () => { if (active) setIssue(true); });
  });
  return (
    <>
      <Show when={session()} fallback={props.children(<EngagementControls score={(props.post.upvoteCount ?? 0) - (props.post.downvoteCount ?? 0)} commentCount={props.post.commentCount ?? 0} busy={!anonymous()} onVote={requestGlobalSignIn} onComment={requestGlobalSignIn} />)}>
        <Show when={session()}>{viewer => (
          <PostEngagement canReportPost={props.canReportPost} post={{ ...props.post, viewerVote: vote()?.value ?? null }} votesReady={vote() !== undefined} principalId={viewer().userId}
            personaId={personaId()} communityId={props.communityId} transport={props.dependencies?.transport}
            readComments={props.dependencies?.readComments} pendingStorage={props.dependencies?.pendingStorage}
            presentation={props.presentation} newestFirstRoots={props.newestFirstRoots} joinHref={props.joinHref}
            target={props.target} readTarget={props.dependencies?.readTarget}
            // The comment box opens with who the viewer comments as; with
            // several profiles here, tapping it opens the same picker.
            composerIdentity={<OperationPersonaControl appearance="avatar" class="shrink-0" label="Commenting as" placeholder="Choose a profile to comment as" personas={toOperationPersonas(personas())} selectedPersonaId={personaId()} onSelect={id => { setPersonaId(id); targetedPersona?.select(id); }} />}>
            {(controls, menuActions) => props.children(controls, menuActions, viewer())}
          </PostEngagement>
        )}</Show>
        <Show when={!inline() && personas().length > 1}>
          <OperationPersonaControl label="Commenting as" placeholder="Choose a profile" personas={toOperationPersonas(personas())} selectedPersonaId={personaId()} onSelect={setPersonaId} />
        </Show>
      </Show>
      <Show when={anonymous() && props.showSignInPrompt !== false}>
        <Show when={inline()} fallback={<Button onClick={requestGlobalSignIn} variant="secondary">Sign in to comment</Button>}>
          {/* Reading comments needs an account, so a signed-out viewer sees only this bar. */}
          <div class="border-t border-border-soft bg-background px-5 pb-4 pt-3 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:pb-[calc(1rem+env(safe-area-inset-bottom))]" data-comment-bar>
            <Button class="w-full" onClick={requestGlobalSignIn}>Sign in to comment</Button>
          </div>
        </Show>
      </Show>
      <Show when={issue()}><p role="status">Your post actions could not be checked. <Button onClick={() => session() ? void readVote() : location.reload()} size="sm" variant="secondary">Retry</Button></p></Show>
    </>
  );
}
