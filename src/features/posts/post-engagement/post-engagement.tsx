import type { JSX } from "@solidjs/web";
import { For, Show, createMemo, createSignal, untrack } from "solid-js";

import {
  Button,
  Card,
  CardContent,
  CommentPill,
  FormattedTextarea,
  Type,
  VotePill,
} from "../../../design-system.ts";
import { FeedPanelLayout, FeedSidePanel } from "../feed-side-panel/feed-side-panel.tsx";
import {
  type CommentModerationAction,
  type CommentReportReason,
  type PostEngagementTransport,
  createPostEngagementTransport,
} from "./post-engagement-api.ts";
import {
  type CommentThreadItem,
  type EngagementIssue,
  adjustReplyCount,
  applyModerationOutcome,
  canReplyToComment,
  commentCountsAsPublished,
  engagementIssueMessage,
  mapEngagementIssue,
  nextVoteScore,
  settledComment,
  submittingComment,
} from "./post-engagement-model.ts";

export interface PostEngagementPost {
  readonly id: string;
  readonly upvoteCount: number | null;
  readonly downvoteCount: number | null;
  readonly commentCount: number | null;
  readonly viewerVote: -1 | 1 | null;
}

export interface PostEngagementProps {
  readonly post: PostEngagementPost;
  readonly transport?: PostEngagementTransport;
  readonly initialComments?: readonly CommentThreadItem[];
  readonly canModerate?: boolean;
  readonly generateIdempotencyKey?: () => string;
  readonly children?: (controls: JSX.Element) => JSX.Element;
}

type ComposeTarget =
  | { readonly kind: "comment" }
  | { readonly kind: "reply"; readonly parentId: string };

interface SubmissionAttempt {
  readonly body: string;
  readonly depth: number;
  readonly parentId: string | null;
  readonly key: string;
}

interface VoteAttempt {
  readonly value: -1 | 1 | null;
  readonly key: string;
}

const REPORT_REASONS: ReadonlyArray<{ readonly value: CommentReportReason; readonly label: string }> = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "hate", label: "Hate" },
  { value: "sexual_content", label: "Sexual content" },
  { value: "graphic_content", label: "Graphic content" },
  { value: "misleading", label: "Misleading" },
  { value: "other", label: "Other" },
];

function defaultIdempotencyKey(): string {
  return crypto.randomUUID();
}

function reportReasonFromValue(value: string): CommentReportReason {
  return REPORT_REASONS.find(reason => reason.value === value)?.value ?? "other";
}

function commentStateLabel(item: CommentThreadItem): string {
  switch (item.state) {
    case "submitting": return "Submitting";
    case "published": return "Published";
    case "manual_review": return item.lastModerationAction === "dismiss" ? "Review dismissed" : "Held for review";
    case "blocked": return "Blocked by policy";
    case "hidden": return "Hidden";
    case "removed": return "Removed";
    case "restored": return "Restored";
  }
}

function visibleCommentBody(item: CommentThreadItem): string {
  if (item.state === "hidden") return "This comment is hidden.";
  if (item.state === "removed") return "This comment was removed.";
  if (item.state === "blocked") return "This comment was not published.";
  return item.body;
}

export function PostEngagement(props: PostEngagementProps) {
  const initial = untrack(() => ({
    transport: props.transport ?? createPostEngagementTransport(),
    generateKey: props.generateIdempotencyKey ?? defaultIdempotencyKey,
    score: (props.post.upvoteCount ?? 0) - (props.post.downvoteCount ?? 0),
    viewerVote: props.post.viewerVote,
    comments: props.initialComments ?? [],
    commentCount: props.post.commentCount ?? 0,
  }));
  const transport = initial.transport;
  const generateKey = initial.generateKey;
  const [score, setScore] = createSignal(initial.score);
  const [viewerVote, setViewerVote] = createSignal(initial.viewerVote);
  const [voteBusy, setVoteBusy] = createSignal(false);
  const [voteAttempt, setVoteAttempt] = createSignal<VoteAttempt>();
  const [panelOpen, setPanelOpen] = createSignal(false);
  const [comments, setComments] = createSignal<readonly CommentThreadItem[]>(initial.comments);
  const [commentCount, setCommentCount] = createSignal(initial.commentCount);
  const [composeTarget, setComposeTarget] = createSignal<ComposeTarget>({ kind: "comment" });
  const [draft, setDraft] = createSignal("");
  const [submissionAttempt, setSubmissionAttempt] = createSignal<SubmissionAttempt>();
  const [submissionBusy, setSubmissionBusy] = createSignal(false);
  const [issue, setIssue] = createSignal<EngagementIssue>();
  const [reportReason, setReportReason] = createSignal<CommentReportReason>("spam");
  const [actionBusyId, setActionBusyId] = createSignal<string>();
  const actionKeys = new Map<string, string>();

  const targetParent = createMemo(() => {
    const target = composeTarget();
    return target.kind === "reply"
      ? comments().find(comment => comment.id === target.parentId)
      : undefined;
  });

  const updateDraft = (value: string) => {
    setDraft(value);
    const attempt = submissionAttempt();
    if (attempt && attempt.body !== value.trim()) setSubmissionAttempt(undefined);
  };

  const openComments = () => {
    setPanelOpen(true);
    setIssue(undefined);
  };

  const selectReply = (item: CommentThreadItem) => {
    if (!canReplyToComment(item)) {
      if (item.depth >= 8) setIssue({ kind: "reply_depth_exceeded" });
      return;
    }
    setComposeTarget({ kind: "reply", parentId: item.id });
    setDraft("");
    setSubmissionAttempt(undefined);
  };

  const submit = async () => {
    const body = draft().trim();
    if (!body || submissionBusy()) return;
    const target = composeTarget();
    const parent = target.kind === "reply" ? targetParent() : undefined;
    if (target.kind === "reply" && (!parent || !canReplyToComment(parent))) {
      setIssue({ kind: parent?.depth === 8 ? "reply_depth_exceeded" : "not_found" });
      return;
    }
    const depth = parent ? parent.depth + 1 : 0;
    const parentId = parent?.id ?? null;
    const priorAttempt = submissionAttempt();
    const attempt = priorAttempt?.body === body && priorAttempt.parentId === parentId
      ? priorAttempt
      : { body, depth, parentId, key: generateKey() };
    setSubmissionAttempt(attempt);
    const pending = submittingComment(body, depth, parentId, attempt.key);
    setComments(items => [...items.filter(item => item.id !== pending.id), pending]);
    setSubmissionBusy(true);
    setIssue(undefined);
    try {
      const response = parent
        ? await transport.createReply(parent.id, body, attempt.key)
        : await transport.createComment(props.post.id, body, attempt.key);
      const settled = settledComment(pending, response);
      setComments(items => {
        let next = items.map(item => item.id === pending.id ? settled : item);
        if (settled.state === "published" && parentId) next = [...adjustReplyCount(next, parentId, 1)];
        return next;
      });
      if (settled.state === "published") setCommentCount(value => value + 1);
      setDraft("");
      setComposeTarget({ kind: "comment" });
      setSubmissionAttempt(undefined);
    } catch (error) {
      setComments(items => items.filter(item => item.id !== pending.id));
      setIssue(mapEngagementIssue(error));
    } finally {
      setSubmissionBusy(false);
    }
  };

  const vote = async (direction: "up" | "down" | null) => {
    if (voteBusy()) return;
    const value: -1 | 1 | null = direction === "up" ? 1 : direction === "down" ? -1 : null;
    const prior = voteAttempt();
    const attempt = prior?.value === value ? prior : { value, key: generateKey() };
    setVoteAttempt(attempt);
    setVoteBusy(true);
    setIssue(undefined);
    try {
      const response = value === null
        ? await transport.clearVote(props.post.id, attempt.key)
        : await transport.castVote(props.post.id, value, attempt.key);
      const nextValue = response.value === 0 ? null : response.value;
      setScore(current => nextVoteScore(current, viewerVote(), nextValue));
      setViewerVote(nextValue);
      setVoteAttempt(undefined);
    } catch (error) {
      setIssue(mapEngagementIssue(error));
    } finally {
      setVoteBusy(false);
    }
  };

  const report = async (item: CommentThreadItem) => {
    if (actionBusyId() || !commentCountsAsPublished(item)) return;
    const identity = `report:${item.id}:${reportReason()}`;
    const key = actionKeys.get(identity) ?? generateKey();
    actionKeys.set(identity, key);
    setActionBusyId(item.id);
    setIssue(undefined);
    try {
      const response = await transport.reportComment(item.id, reportReason(), key);
      setComments(items => items.map(comment => comment.id === item.id
        ? { ...comment, caseRef: response.case_ref, reportState: response.status }
        : comment));
      actionKeys.delete(identity);
    } catch (error) {
      setIssue(mapEngagementIssue(error));
    } finally {
      setActionBusyId(undefined);
    }
  };

  const moderate = async (item: CommentThreadItem, action: CommentModerationAction) => {
    if (actionBusyId() || !item.caseRef) return;
    const identity = `moderate:${item.caseRef}:${action}`;
    const key = actionKeys.get(identity) ?? generateKey();
    actionKeys.set(identity, key);
    setActionBusyId(item.id);
    setIssue(undefined);
    try {
      const response = await transport.moderateCase(item.caseRef, action, key);
      const nextItem = applyModerationOutcome(item, response);
      const countDelta = Number(commentCountsAsPublished(nextItem)) - Number(commentCountsAsPublished(item));
      setComments(items => {
        const updated = items.map(comment => comment.id === item.id ? nextItem : comment);
        return item.parentId && countDelta !== 0
          ? adjustReplyCount(updated, item.parentId, countDelta > 0 ? 1 : -1)
          : updated;
      });
      if (countDelta !== 0) setCommentCount(value => Math.max(0, value + countDelta));
      actionKeys.delete(identity);
    } catch (error) {
      setIssue(mapEngagementIssue(error));
    } finally {
      setActionBusyId(undefined);
    }
  };

  const controls = () => (
    <div class="flex flex-wrap items-center gap-3" data-post-engagement-controls data-viewer-control>
      <VotePill
        allowClear
        busy={voteBusy()}
        onVote={vote}
        score={score()}
        viewerVote={viewerVote() === 1 ? "up" : viewerVote() === -1 ? "down" : null}
      />
      <CommentPill count={commentCount()} onComment={openComments} />
      <Show when={issue()}>
        {(currentIssue) => <Type role="alert" variant="caption">{engagementIssueMessage(currentIssue())}</Type>}
      </Show>
    </div>
  );

  const panel = () => (
    <FeedSidePanel
      closeLabel="Close comments"
      description={`${commentCount()} comments reported by the post`}
      onOpenChange={setPanelOpen}
      open={panelOpen()}
      title="Comments"
    >
      <div class="flex h-full flex-col">
        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4" data-comment-thread>
          <Show
            when={comments().length > 0}
            fallback={<Type variant="body">No thread details are loaded. New comments from this session appear here.</Type>}
          >
            <div class="flex flex-col gap-3">
              <For each={comments()}>{item => (
                <Card
                  class="border-border-soft"
                  data-comment-depth={item.depth}
                  data-comment-id={item.id}
                  data-comment-state={item.state}
                  style={{ "margin-inline-start": `${Math.min(item.depth, 8) * 0.75}rem` }}
                >
                  <CardContent class="flex flex-col gap-2 p-4">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <Type variant="label">{commentStateLabel(item)}</Type>
                      <Type variant="caption">Depth {item.depth} · {item.replyCount} replies</Type>
                    </div>
                    <Type variant="body">{visibleCommentBody(item)}</Type>
                    <Show when={item.reportState}>
                      {(reportState) => <Type role="status" variant="caption">Report {reportState()}</Type>}
                    </Show>
                    <div class="flex flex-wrap gap-2">
                      <Show when={canReplyToComment(item)}>
                        <Button onClick={() => selectReply(item)} size="sm" type="button" variant="outline">Reply</Button>
                      </Show>
                      <Show when={commentCountsAsPublished(item)}>
                        <Button disabled={actionBusyId() === item.id} onClick={() => void report(item)} size="sm" type="button" variant="ghost">Report</Button>
                      </Show>
                      <Show when={props.canModerate && item.caseRef}>
                        <Show when={item.state === "manual_review"}>
                          <Button disabled={actionBusyId() === item.id} onClick={() => void moderate(item, "approve")} size="sm" type="button">Approve</Button>
                          <Button disabled={actionBusyId() === item.id} onClick={() => void moderate(item, "dismiss")} size="sm" type="button" variant="outline">Dismiss</Button>
                        </Show>
                        <Show when={item.state === "published" || item.state === "restored"}>
                          <Button disabled={actionBusyId() === item.id} onClick={() => void moderate(item, "hide")} size="sm" type="button" variant="outline">Hide</Button>
                          <Button disabled={actionBusyId() === item.id} onClick={() => void moderate(item, "remove")} size="sm" type="button" variant="outline">Remove</Button>
                        </Show>
                        <Show when={item.state === "hidden" || item.state === "removed"}>
                          <Button disabled={actionBusyId() === item.id} onClick={() => void moderate(item, "restore")} size="sm" type="button">Restore</Button>
                        </Show>
                      </Show>
                    </div>
                  </CardContent>
                </Card>
              )}</For>
            </div>
          </Show>
        </div>
        <div class="shrink-0 border-t border-border-soft px-5 py-4">
          <Show when={composeTarget().kind === "reply" && targetParent()}>
            {(parent) => (
              <div class="mb-2 flex items-center justify-between gap-3">
                <Type variant="caption">Replying at depth {parent().depth + 1}</Type>
                <Button onClick={() => setComposeTarget({ kind: "comment" })} size="sm" type="button" variant="ghost">Cancel reply</Button>
              </div>
            )}
          </Show>
          <FormattedTextarea
            aria-label={composeTarget().kind === "reply" ? "Write a reply" : "Write a comment"}
            disabled={submissionBusy()}
            onChange={updateDraft}
            placeholder={composeTarget().kind === "reply" ? "Write a reply…" : "Join the conversation…"}
            value={draft()}
          />
          <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label class="flex items-center gap-2 text-sm text-muted-foreground">
              Report reason
              <select
                aria-label="Report reason"
                class="rounded-md border border-input bg-background px-2 py-1"
                onChange={(event) => setReportReason(reportReasonFromValue(event.currentTarget.value))}
                value={reportReason()}
              >
                <For each={REPORT_REASONS}>{reason => <option value={reason.value}>{reason.label}</option>}</For>
              </select>
            </label>
            <Button disabled={submissionBusy() || draft().trim() === ""} onClick={() => void submit()} type="button">
              {submissionBusy() ? "Submitting" : composeTarget().kind === "reply" ? "Post reply" : "Post comment"}
            </Button>
          </div>
          <Show when={issue()}>
            {(currentIssue) => <Type class="mt-2" role="alert" variant="caption">{engagementIssueMessage(currentIssue())}</Type>}
          </Show>
        </div>
      </div>
    </FeedSidePanel>
  );

  return (
    <FeedPanelLayout panel={panelOpen() ? panel() : undefined}>
      {props.children ? props.children(controls()) : controls()}
    </FeedPanelLayout>
  );
}
