import { relativeTime } from "./relative-time.ts";
import { Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { Card, CardContent, CommunityAvatar, Type } from "../../../design-system.ts";
import { AgeAccessPrompt } from "../../verification/age-access-prompt.tsx";
import type { CommentThreadItem } from "../post-engagement/post-engagement-model.ts";
import { ContentOverflowMenu, type ContentAction } from "./content-overflow-menu.tsx";

function commentStateLabel(item: CommentThreadItem): string {
  switch (item.state) {
    case "age_locked": return "Age verification required";
    case "submitting": return "Submitting";
    case "published": return "Published";
    case "manual_review": return "Held for review";
    case "blocked": return "Blocked by policy";
    case "hidden": return "Hidden";
    case "removed": return "Removed";
    case "restored": return "Restored";
  }
}

function visibleCommentBody(item: CommentThreadItem): string {
  if (item.state === "age_locked") return "Verify your age to view this comment.";
  if (item.state === "hidden") return "This comment is hidden.";
  if (item.state === "removed") return "This comment was removed.";
  if (item.state === "blocked") return "This comment was not published.";
  return item.body;
}

export interface CommentCardProps {
  readonly item: CommentThreadItem;
  readonly onAgeVerified?: (signal: AbortSignal) => void | Promise<void>;
  readonly menuActions?: readonly ContentAction[];
  readonly communityLabel?: string;
  readonly postContext?: { readonly title: string; readonly href: string };
  readonly children?: JSX.Element;
}

/** Shared public comment presentation; command and privacy decisions stay outside. */
export function CommentCard(props: CommentCardProps) {
  const item = () => props.item;
  return <Card class="border-border-soft" data-comment-depth={item().depth} data-comment-id={item().id} data-comment-state={item().state}
    style={{ "margin-inline-start": `${Math.min(item().depth, 8) * 0.75}rem` }}>
    <CardContent class="flex flex-col gap-3 p-4">
      <div class="flex min-w-0 items-center gap-2">
        <Show when={item().authorLabel && item().state !== "age_locked"}><CommunityAvatar avatarSrc={item().authorAvatarRef} communityId={item().id} displayName={item().authorLabel ?? "Public creator"} size="xs" /></Show>
        <div class="min-w-0 flex-1"><Type variant="label">{item().state === "age_locked" ? commentStateLabel(item()) : item().authorLabel ?? commentStateLabel(item())}</Type>
          <Show when={item().state !== "age_locked" && relativeTime(item().createdAt)}>{timestamp => <Type as="span" variant="caption" class="ml-2">{timestamp()}</Type>}</Show>
          <Show when={item().state !== "age_locked" && props.communityLabel}><Type as="p" variant="caption">{props.communityLabel}</Type></Show>
        </div>
        <ContentOverflowMenu label="Comment options" actions={item().state === "age_locked" ? undefined : props.menuActions} />
      </div>
      <Show when={item().state === "age_locked"} fallback={<Type as="p" variant="body">{visibleCommentBody(item())}</Type>}><Show when={props.onAgeVerified} fallback={<Type variant="body">Verify your age to view this comment.</Type>}>{refresh => <AgeAccessPrompt onVerified={refresh()} />}</Show></Show>
      <Show when={item().reportState}>{state => <Type role="status" variant="caption">Report {state()}</Type>}</Show>
      {props.children}
      <Show when={item().state !== "age_locked" && props.postContext ? props.postContext : undefined}>{post => <a href={post().href} class="hover:underline"><Type variant="h4">{post().title}</Type></a>}</Show>
    </CardContent>
  </Card>;
}
