import type { JSX } from "@solidjs/web";
import { For, Show, createEffect, createMemo, createSignal, untrack } from "solid-js";

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
  isPostEngagementApiClientError,
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
  isCommentAddressable,
  nextVoteScore,
  settledComment,
  submittingComment,
} from "./post-engagement-model.ts";
import {
  commentReportSlot,
  commentSubmissionSlot,
  createDefaultPendingEngagementStorage,
  createPendingEngagementRecord,
  decodePendingEngagementAction,
  moderationCaseSlot,
  postVoteSlot,
  type PendingEngagementAction,
  type PendingEngagementIssue,
  type PendingEngagementRecord,
  type PendingEngagementStorage,
} from "./post-engagement-pending.ts";

export interface PostEngagementPost {
  readonly id: string;
  readonly upvoteCount: number | null;
  readonly downvoteCount: number | null;
  readonly commentCount: number | null;
  readonly viewerVote: -1 | 1 | null;
}

export interface PostEngagementProps {
  readonly post: PostEngagementPost;
  readonly principalId: string;
  readonly communityId?: string;
  readonly transport?: PostEngagementTransport;
  readonly initialComments?: readonly CommentThreadItem[];
  readonly canModerate?: boolean;
  readonly generateIdempotencyKey?: () => string;
  readonly pendingStorage?: PendingEngagementStorage;
  readonly children?: (controls: JSX.Element) => JSX.Element;
}

type ComposeTarget =
  | { readonly kind: "comment" }
  | { readonly kind: "reply"; readonly parentId: string };

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
    case "manual_review": return "Held for review";
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

function unavailablePendingStorage(): PendingEngagementStorage {
  const unavailable = async (): Promise<never> => { throw new Error("Durable pending storage is unavailable"); };
  return { load: unavailable, listForPost: unavailable, saveNew: unavailable, save: unavailable, remove: unavailable };
}

function sameIntent(left: PendingEngagementAction, right: PendingEngagementAction): boolean {
  switch (left.kind) {
    case "comment": return right.kind === "comment" && left.postId === right.postId && left.body === right.body;
    case "reply": return right.kind === "reply" && left.commentId === right.commentId && left.body === right.body;
    case "report": return right.kind === "report" && left.commentId === right.commentId && left.reasonCode === right.reasonCode;
    case "moderate": return right.kind === "moderate"
      && left.caseRef === right.caseRef
      && left.action === right.action
      && left.expectedCaseRevision === right.expectedCaseRevision;
    case "vote": return right.kind === "vote" && left.postId === right.postId && left.value === right.value;
    case "clear_vote": return right.kind === "clear_vote" && left.postId === right.postId;
  }
}

function issueFromPending(issue: PendingEngagementIssue): EngagementIssue {
  return issue.kind === "idempotency_conflict"
    ? { kind: "idempotency_conflict", identity: issue.identity }
    : issue.code === "auth_error"
      ? { kind: "auth_required" }
      : issue.code === "membership_required"
        ? { kind: "membership_required" }
        : issue.code === "not_found"
          ? { kind: "not_found" }
          : issue.code === "comments_locked"
            ? { kind: "comments_locked" }
            : issue.code === "gate_unsatisfied"
              ? { kind: "gate_unsatisfied" }
              : issue.code === "reply_depth_exceeded"
                ? { kind: "reply_depth_exceeded" }
                : issue.code === "bad_request"
                  ? { kind: "bad_request" }
                  : { kind: "conflict" };
}

export function PostEngagement(props: PostEngagementProps) {
  const initial = untrack(() => ({
    transport: props.transport ?? createPostEngagementTransport(),
    generateKey: props.generateIdempotencyKey ?? defaultIdempotencyKey,
    pendingStorage: (() => {
      try {
        return props.pendingStorage ?? createDefaultPendingEngagementStorage();
      } catch {
        return unavailablePendingStorage();
      }
    })(),
    score: (props.post.upvoteCount ?? 0) - (props.post.downvoteCount ?? 0),
    viewerVote: props.post.viewerVote,
    comments: props.initialComments ?? [],
    commentCount: props.post.commentCount ?? 0,
  }));
  const transport = initial.transport;
  const generateKey = initial.generateKey;
  const pendingStorage = initial.pendingStorage;
  const [score, setScore] = createSignal(initial.score);
  const [viewerVote, setViewerVote] = createSignal(initial.viewerVote);
  const [voteBusy, setVoteBusy] = createSignal(false);
  const [panelOpen, setPanelOpen] = createSignal(false);
  const [comments, setComments] = createSignal<readonly CommentThreadItem[]>(initial.comments);
  const [commentCount, setCommentCount] = createSignal(initial.commentCount);
  const [composeTarget, setComposeTarget] = createSignal<ComposeTarget>({ kind: "comment" });
  const [draft, setDraft] = createSignal("");
  const [submissionBusy, setSubmissionBusy] = createSignal(false);
  const [issue, setIssue] = createSignal<EngagementIssue>();
  const [discardableRecord, setDiscardableRecord] = createSignal<PendingEngagementRecord>();
  const [retainedRecord, setRetainedRecord] = createSignal<PendingEngagementRecord>();
  const [retainedBusy, setRetainedBusy] = createSignal(false);
  const [reportReason, setReportReason] = createSignal<CommentReportReason>("spam");
  const [actionBusyId, setActionBusyId] = createSignal<string>();

  const targetParent = createMemo(() => {
    const target = composeTarget();
    return target.kind === "reply"
      ? comments().find(comment => comment.id === target.parentId)
      : undefined;
  });

  const updateDraft = (value: string) => setDraft(value);

  const refreshRetainedRecords = async (): Promise<void> => {
    const records = await pendingStorage.listForPost(props.principalId, props.post.id);
    const rejected = records.find(record => record.issue !== undefined);
    setDiscardableRecord(rejected);
    setRetainedRecord(rejected === undefined
      ? records.find(record => record.issue === undefined)
      : undefined);
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
  };

  const prepareRecord = async (
    slot: string,
    createAction: (idempotencyKey: string) => PendingEngagementAction,
  ): Promise<PendingEngagementRecord | null> => {
    try {
      const existing = await pendingStorage.load(slot);
      if (existing !== null) {
        if (existing.issue !== undefined) {
          setDiscardableRecord(existing);
          setIssue(issueFromPending(existing.issue));
          return null;
        }
        const retained = await decodePendingEngagementAction(existing.envelope);
        if (!sameIntent(retained, createAction(retained.idempotencyKey))) {
          setRetainedRecord(existing);
          setIssue({ kind: "pending_action" });
          return null;
        }
        return existing;
      }
      const record = await createPendingEngagementRecord(createAction(generateKey()), {
        principalId: props.principalId,
        postId: props.post.id,
      });
      try {
        await pendingStorage.saveNew(record);
        return record;
      } catch {
        const winner = await pendingStorage.load(slot);
        if (winner === null) throw new Error("Pending engagement record was not committed");
        if (winner.issue !== undefined) {
          setDiscardableRecord(winner);
          setIssue(issueFromPending(winner.issue));
          return null;
        }
        const retained = await decodePendingEngagementAction(winner.envelope);
        if (!sameIntent(retained, createAction(retained.idempotencyKey))) {
          setRetainedRecord(winner);
          setIssue({ kind: "pending_action" });
          return null;
        }
        return winner;
      }
    } catch {
      setIssue({ kind: "durable_storage_failed" });
      return null;
    }
  };

  const retainFailure = async (record: PendingEngagementRecord, error: unknown): Promise<void> => {
    const projected = mapEngagementIssue(error);
    setIssue(projected);
    setRetainedRecord(record);
    if (!isPostEngagementApiClientError(error) || error.retryable) return;
    if (record.action_kind === "moderate" && projected.kind === "conflict") {
      setIssue({ kind: "moderation_changed" });
      try {
        await pendingStorage.remove(record.slot);
        setRetainedRecord(undefined);
      } catch {
        setIssue({ kind: "durable_storage_failed" });
      }
      return;
    }
    const definitiveRejection = projected.kind === "idempotency_conflict" || error.status === 400 || error.status === 403;
    if (!definitiveRejection) return;
    const retainedIssue: PendingEngagementIssue = projected.kind === "idempotency_conflict"
      ? { kind: "idempotency_conflict", identity: projected.identity }
      : { kind: "server_rejection", status: error.status, code: error.code };
    const rejected = { ...record, issue: retainedIssue };
    try {
      await pendingStorage.save(rejected);
      setDiscardableRecord(rejected);
      setRetainedRecord(undefined);
    } catch {
      setIssue({ kind: "durable_storage_failed" });
    }
  };

  const resolveRecord = async (record: PendingEngagementRecord): Promise<void> => {
    try {
      await pendingStorage.remove(record.slot);
    } catch {
      // The decoded server response is authoritative. A retained key can only
      // replay that stored result; cleanup failure must not erase the result.
    }
    if (discardableRecord()?.slot === record.slot) setDiscardableRecord(undefined);
    if (retainedRecord()?.slot === record.slot) setRetainedRecord(undefined);
    try {
      await refreshRetainedRecords();
    } catch {
      // The successful response remains authoritative even when discovery of
      // another retained action has to wait for the next component mount.
    }
  };

  const discardRejected = async (): Promise<void> => {
    const record = discardableRecord();
    if (record?.issue === undefined) return;
    try {
      await pendingStorage.remove(record.slot);
      setDiscardableRecord(undefined);
      setIssue(undefined);
      await refreshRetainedRecords();
    } catch {
      setIssue({ kind: "durable_storage_failed" });
    }
  };

  createEffect(
    () => true,
    () => { void (async () => {
      try {
        const records = await pendingStorage.listForPost(props.principalId, props.post.id);
        const decoded = await Promise.all(records.map(async record => ({
          record,
          action: await decodePendingEngagementAction(record.envelope),
        })));
        const pendingSubmission = records.find(record => record.slot === commentSubmissionSlot(props.principalId, props.post.id));
        if (pendingSubmission !== undefined) {
          const action = await decodePendingEngagementAction(pendingSubmission.envelope);
          if (action.kind === "comment" && draft() === "") {
            setComposeTarget({ kind: "comment" });
            setDraft(action.body);
          } else if (action.kind === "reply" && draft() === "" && comments().some(item => item.id === action.commentId)) {
            setComposeTarget({ kind: "reply", parentId: action.commentId });
            setDraft(action.body);
          }
          setIssue({ kind: "unavailable" });
        } else if (records.length > 0) {
          setIssue({ kind: "unavailable" });
        }
        const pendingReport = decoded.find(entry => entry.action.kind === "report");
        if (pendingReport?.action.kind === "report") setReportReason(pendingReport.action.reasonCode);
        const rejected = records.find(record => record.issue !== undefined);
        if (rejected?.issue !== undefined) {
          setDiscardableRecord(rejected);
          setIssue(issueFromPending(rejected.issue));
        } else {
          const retained = records.find(record => record.issue === undefined);
          if (retained !== undefined) setRetainedRecord(retained);
        }
      } catch {
        setIssue({ kind: "durable_storage_failed" });
      }
    })(); },
  );

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
    setSubmissionBusy(true);
    setIssue(undefined);
    const slot = commentSubmissionSlot(props.principalId, props.post.id);
    const record = await prepareRecord(slot, key => parent
      ? { kind: "reply", commentId: parent.id, body, idempotencyKey: key }
      : { kind: "comment", postId: props.post.id, body, idempotencyKey: key });
    if (record === null) {
      setSubmissionBusy(false);
      return;
    }
    const retained = await decodePendingEngagementAction(record.envelope);
    const retainedBody = retained.kind === "comment" || retained.kind === "reply" ? retained.body : body;
    const pending = submittingComment(retainedBody, depth, parentId, retained.idempotencyKey);
    setComments(items => [...items.filter(item => item.id !== pending.id), pending]);
    try {
      const response = retained.kind === "reply"
        ? await transport.createReply(record.envelope)
        : await transport.createComment(record.envelope);
      const settled = settledComment(pending, response);
      setComments(items => {
        let next = items.map(item => item.id === pending.id ? settled : item);
        if (settled.state === "published" && parentId) next = [...adjustReplyCount(next, parentId, 1)];
        return next;
      });
      if (settled.state === "published") setCommentCount(value => value + 1);
      setDraft("");
      setComposeTarget({ kind: "comment" });
      await resolveRecord(record);
    } catch (error) {
      setComments(items => items.filter(item => item.id !== pending.id));
      await retainFailure(record, error);
    } finally {
      setSubmissionBusy(false);
    }
  };

  const vote = async (direction: "up" | "down" | null) => {
    if (voteBusy()) return;
    const value: -1 | 1 | null = direction === "up" ? 1 : direction === "down" ? -1 : null;
    setVoteBusy(true);
    setIssue(undefined);
    const record = await prepareRecord(postVoteSlot(props.principalId, props.post.id), key => value === null
      ? { kind: "clear_vote", postId: props.post.id, idempotencyKey: key }
      : { kind: "vote", postId: props.post.id, value, idempotencyKey: key });
    if (record === null) {
      setVoteBusy(false);
      return;
    }
    try {
      const retained = await decodePendingEngagementAction(record.envelope);
      const response = retained.kind === "clear_vote"
        ? await transport.clearVote(record.envelope)
        : await transport.castVote(record.envelope);
      const nextValue = response.value === 0 ? null : response.value;
      setScore(current => nextVoteScore(current, viewerVote(), nextValue));
      setViewerVote(nextValue);
      await resolveRecord(record);
    } catch (error) {
      await retainFailure(record, error);
    } finally {
      setVoteBusy(false);
    }
  };

  const report = async (item: CommentThreadItem) => {
    if (actionBusyId() || !commentCountsAsPublished(item) || !isCommentAddressable(item)) return;
    setActionBusyId(item.id);
    setIssue(undefined);
    const record = await prepareRecord(commentReportSlot(props.principalId, props.post.id, item.id), key => ({
      kind: "report",
      commentId: item.id,
      reasonCode: reportReason(),
      idempotencyKey: key,
    }));
    if (record === null) {
      setActionBusyId(undefined);
      return;
    }
    try {
      const response = await transport.reportComment(record.envelope);
      setComments(items => items.map(comment => comment.id === item.id
        ? { ...comment, caseRef: response.case_ref, reportState: response.status }
        : comment));
      await resolveRecord(record);
    } catch (error) {
      await retainFailure(record, error);
    } finally {
      setActionBusyId(undefined);
    }
  };

  const moderate = async (item: CommentThreadItem, action: CommentModerationAction) => {
    if (actionBusyId() || !item.caseRef || !props.communityId) return;
    setActionBusyId(item.id);
    setIssue(undefined);
    let expectedCaseRevision: number;
    try {
      const detail = await transport.readModerationCase(props.communityId, item.caseRef);
      const moderationCase = detail.case;
      if (
        moderationCase.case_ref !== item.caseRef
        || moderationCase.community_id !== props.communityId
        || (moderationCase.target_type !== "comment" && moderationCase.target_type !== "reply")
        || (moderationCase.target_id !== null && moderationCase.target_id !== item.id)
        || !moderationCase.permitted_actions.includes(action)
        || typeof moderationCase.case_revision !== "number"
        || !Number.isSafeInteger(moderationCase.case_revision)
        || moderationCase.case_revision < 1
      ) {
        setIssue({ kind: "moderation_changed" });
        setActionBusyId(undefined);
        return;
      }
      expectedCaseRevision = moderationCase.case_revision;
    } catch (error) {
      setIssue(mapEngagementIssue(error));
      setActionBusyId(undefined);
      return;
    }
    const record = await prepareRecord(moderationCaseSlot(props.principalId, props.post.id, item.caseRef), key => ({
      kind: "moderate",
      caseRef: item.caseRef ?? "",
      action,
      expectedCaseRevision,
      idempotencyKey: key,
    }));
    if (record === null) {
      setActionBusyId(undefined);
      return;
    }
    try {
      const response = await transport.moderateCase(record.envelope);
      let nextItem = applyModerationOutcome(item, response);
      let readbackComplete = true;
      if (item.state === "manual_review" && item.submissionId !== null && response.target_status === "published") {
        try {
          const snapshot = await transport.readSubmission(item.submissionId);
          nextItem = { ...settledComment(nextItem, snapshot), lastModerationAction: response.action };
        } catch {
          // The action response remains authoritative for visibility. Until a
          // readback supplies comment_id, retain the action record and expose
          // an explicit recovery action without replaying under a new key.
          nextItem = { ...nextItem, caseRef: response.case_ref };
          readbackComplete = false;
          setIssue({ kind: "unavailable" });
        }
      }
      const countDelta = Number(commentCountsAsPublished(nextItem)) - Number(commentCountsAsPublished(item));
      setComments(items => {
        const updated = items.map(comment => comment.id === item.id ? nextItem : comment);
        return item.parentId && countDelta !== 0
          ? adjustReplyCount(updated, item.parentId, countDelta > 0 ? 1 : -1)
          : updated;
      });
      if (countDelta !== 0) setCommentCount(value => Math.max(0, value + countDelta));
      if (readbackComplete) await resolveRecord(record);
    } catch (error) {
      await retainFailure(record, error);
    } finally {
      setActionBusyId(undefined);
    }
  };

  const refreshComment = async (item: CommentThreadItem) => {
    if (actionBusyId() || item.submissionId === null) return;
    setActionBusyId(item.id);
    setIssue(undefined);
    try {
      const snapshot = await transport.readSubmission(item.submissionId);
      const refreshed = settledComment(item, snapshot);
      setComments(items => items.map(comment => comment.id === item.id ? refreshed : comment));
      if (item.caseRef !== null) {
        const retained = await pendingStorage.load(moderationCaseSlot(props.principalId, props.post.id, item.caseRef));
        if (retained !== null) await resolveRecord(retained);
      }
    } catch (error) {
      setIssue(mapEngagementIssue(error));
    } finally {
      setActionBusyId(undefined);
    }
  };

  const retryRetained = async (): Promise<void> => {
    const record = retainedRecord();
    if (record === undefined || retainedBusy()) return;
    setRetainedBusy(true);
    setIssue(undefined);
    try {
      const action = await decodePendingEngagementAction(record.envelope);
      switch (action.kind) {
        case "comment":
        case "reply": {
          const parent = action.kind === "reply"
            ? comments().find(item => item.id === action.commentId)
            : undefined;
          const pending = submittingComment(
            action.body,
            parent === undefined ? 0 : parent.depth + 1,
            parent?.id ?? null,
            action.idempotencyKey,
          );
          const response = action.kind === "reply"
            ? await transport.createReply(record.envelope)
            : await transport.createComment(record.envelope);
          const settled = settledComment(pending, response);
          if (action.kind === "comment" || parent !== undefined) {
            setComments(items => {
              let next = [...items.filter(item => item.id !== pending.id), settled];
              if (settled.state === "published" && parent !== undefined) {
                next = [...adjustReplyCount(next, parent.id, 1)];
              }
              return next;
            });
          }
          if (settled.state === "published") setCommentCount(value => value + 1);
          break;
        }
        case "report": {
          const response = await transport.reportComment(record.envelope);
          setComments(items => items.map(item => item.id === action.commentId
            ? { ...item, caseRef: response.case_ref, reportState: response.status }
            : item));
          break;
        }
        case "moderate": {
          const response = await transport.moderateCase(record.envelope);
          const current = comments().find(item => item.caseRef === action.caseRef);
          if (current !== undefined) {
            let nextItem = applyModerationOutcome(current, response);
            if (current.state === "manual_review" && current.submissionId !== null && response.target_status === "published") {
              const snapshot = await transport.readSubmission(current.submissionId);
              nextItem = { ...settledComment(nextItem, snapshot), lastModerationAction: response.action };
            }
            const countDelta = Number(commentCountsAsPublished(nextItem)) - Number(commentCountsAsPublished(current));
            setComments(items => {
              const updated = items.map(item => item.id === current.id ? nextItem : item);
              return current.parentId && countDelta !== 0
                ? adjustReplyCount(updated, current.parentId, countDelta > 0 ? 1 : -1)
                : updated;
            });
            if (countDelta !== 0) setCommentCount(value => Math.max(0, value + countDelta));
          }
          break;
        }
        case "vote": {
          const response = await transport.castVote(record.envelope);
          setScore(current => nextVoteScore(current, viewerVote(), response.value));
          setViewerVote(response.value);
          break;
        }
        case "clear_vote": {
          await transport.clearVote(record.envelope);
          setScore(current => nextVoteScore(current, viewerVote(), null));
          setViewerVote(null);
          break;
        }
      }
      await resolveRecord(record);
    } catch (error) {
      await retainFailure(record, error);
    } finally {
      setRetainedBusy(false);
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
      <Show when={discardableRecord()?.issue && !panelOpen()}>
        <Button onClick={() => void discardRejected()} size="sm" type="button" variant="outline">Discard rejected action</Button>
      </Show>
      <Show when={retainedRecord() && !panelOpen()}>
        <Button disabled={retainedBusy()} onClick={() => void retryRetained()} size="sm" type="button" variant="outline">Retry retained request</Button>
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
                      <Show when={commentCountsAsPublished(item) && isCommentAddressable(item)}>
                        <Button disabled={actionBusyId() === item.id} onClick={() => void report(item)} size="sm" type="button" variant="ghost">Report</Button>
                      </Show>
                      <Show when={commentCountsAsPublished(item) && !isCommentAddressable(item) && item.submissionId !== null}>
                        <Button disabled={actionBusyId() === item.id} onClick={() => void refreshComment(item)} size="sm" type="button" variant="outline">Refresh comment</Button>
                      </Show>
                      <Show when={props.canModerate && props.communityId && item.caseRef}>
                        <Show when={item.state === "manual_review"}>
                          <Button disabled={actionBusyId() === item.id} onClick={() => void moderate(item, "approve_as_general")} size="sm" type="button">Approve</Button>
                          <Button disabled={actionBusyId() === item.id} onClick={() => void moderate(item, "reject")} size="sm" type="button" variant="outline">Reject</Button>
                        </Show>
                        <Show when={item.state === "published" || item.state === "restored"}>
                          <Button disabled={actionBusyId() === item.id} onClick={() => void moderate(item, "dismiss_report")} size="sm" type="button" variant="ghost">Dismiss report</Button>
                          <Button disabled={actionBusyId() === item.id} onClick={() => void moderate(item, "hide")} size="sm" type="button" variant="outline">Hide</Button>
                        </Show>
                        <Show when={item.state === "hidden" || item.state === "blocked"}>
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
          <Show when={discardableRecord()?.issue}>
            <Button class="mt-2" onClick={() => void discardRejected()} size="sm" type="button" variant="outline">Discard rejected action</Button>
          </Show>
          <Show when={retainedRecord()}>
            <Button class="mt-2" disabled={retainedBusy()} onClick={() => void retryRetained()} size="sm" type="button" variant="outline">Retry retained request</Button>
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
