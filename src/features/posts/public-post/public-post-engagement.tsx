import type { SongActivityViewer } from "./song-activities.tsx";
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

export interface PublicPostEngagementDependencies {
  readonly resolveSession?: () => Promise<SessionResolution>;
  readonly readViewerVote?: (postId: string) => Promise<ViewerVote>;
  readonly transport?: PostEngagementTransport;
  readonly readComments?: CommentThreadReader;
  readonly pendingStorage?: PendingEngagementStorage;
}

/** Public content renders immediately; private controls wait for the viewer's own vote. */
export function PublicPostEngagement(props: {
  post: Omit<PostEngagementPost, "viewerVote">;
  communityId: string;
  canReportPost?: boolean;
  /** Compact lists use the pills to request sign-in without another button per card. */
  showSignInPrompt?: boolean;
  extraControls?: (viewer: () => SongActivityViewer) => JSX.Element;
  dependencies?: PublicPostEngagementDependencies;
  children: (controls?: JSX.Element, menuActions?: readonly ContentAction[]) => JSX.Element;
}) {
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
      setPersonaId(defaultOperationPersonaId(communityOperationPersonas(resolved.personas, props.communityId)));
      await readVote();
    }, () => { if (active) setIssue(true); });
  });
  return (
    <>
      <Show when={session() && vote()} fallback={props.children(<EngagementControls score={(props.post.upvoteCount ?? 0) - (props.post.downvoteCount ?? 0)} commentCount={props.post.commentCount ?? 0} busy={!anonymous()} onVote={requestGlobalSignIn} onComment={requestGlobalSignIn}>{props.extraControls?.(() => session() ?? (anonymous() ? "anonymous" : issue() ? "error" : "pending"))}</EngagementControls>)}>
        <Show when={session()}>{viewer => (
          <PostEngagement canReportPost={props.canReportPost} post={{ ...props.post, viewerVote: vote()!.value }} principalId={viewer().userId}
            personaId={personaId()} communityId={props.communityId} transport={props.dependencies?.transport}
            readComments={props.dependencies?.readComments} pendingStorage={props.dependencies?.pendingStorage} extraControls={props.extraControls?.(viewer)}>
            {(controls, menuActions) => props.children(controls, menuActions)}
          </PostEngagement>
        )}</Show>
        <Show when={personas().length > 1}>
          <OperationPersonaControl label="Commenting as" placeholder="Choose a profile" personas={toOperationPersonas(personas())} selectedPersonaId={personaId()} onSelect={setPersonaId} />
        </Show>
      </Show>
      <Show when={anonymous() && props.showSignInPrompt !== false}><Button onClick={requestGlobalSignIn} variant="secondary">Sign in to comment</Button></Show>
      <Show when={issue()}><p role="status">Your post actions could not be checked. <Button onClick={() => session() ? void readVote() : location.reload()} size="sm" variant="secondary">Retry</Button></p></Show>
    </>
  );
}
