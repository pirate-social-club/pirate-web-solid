import { ContentOverflowMenu } from "../shared-engagement/content-overflow-menu.tsx";
import { CommentCard } from "../shared-engagement/comment-card.tsx";
import { EngagementControls } from "../shared-engagement/engagement-controls.tsx";
import type { ContentAction } from "../shared-engagement/content-overflow-menu.tsx";
import type { CommentThreadReader } from "./comment-thread-api.ts";
import { createCommentThreadController } from "./comment-thread-controller.ts";
import type { JSX } from "@solidjs/web";
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onSettled, untrack } from "solid-js";
import type { CommentNavigation, CommentNavigationReader } from "../../notifications/comment-navigation-api.ts";
import { AgeAccessPrompt } from "../../verification/age-access-prompt.tsx";
import { useTargetedPersona } from "../../notifications/targeted-persona-context.ts";
import { usePageUiLocale } from "../../../lib/ui-locale.tsx";
import { publicProfileLabel } from "../../identity/public-profile-label.ts";

import {
  Button,
  FormattedTextarea,
  IconArrowUp,
  IconChatCircle,
  Modal,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
  Type,
  buttonVariants,
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
  REPORT_REASONS,
  definitiveRejectionIssue,
  issueFromPending,
  preparePendingEngagementRecord,
  unavailablePendingStorage,
} from "./pending-engagement-flow.ts";
import {
  commentReportSlot,
  commentSubmissionSlot,
  createDefaultPendingEngagementStorage,
  decodePendingEngagementAction,
  moderationCaseSlot,
  postVoteSlot,
  postReportSlot,
  type PendingEngagementAction,
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
  /** Account-scoped durable-storage identity; never serialized as persona_id. */
  readonly principalId: string;
  /**
   * Explicit operation persona serialized only for persona-authored commands.
   * Absent when the viewer has not chosen one. Voting is account-scoped and
   * carries no persona, so it stays available; comment and reply authorship
   * does carry one and reports that it needs a profile instead.
   */
  readonly personaId?: string;
  readonly communityId?: string;
  readonly transport?: PostEngagementTransport;
  readonly readComments?: CommentThreadReader;
  readonly initialComments?: readonly CommentThreadItem[];
  readonly canModerate?: boolean;
  /** The current report contract accepts text submissions, not media posts. */
  readonly canReportPost?: boolean;
  readonly generateIdempotencyKey?: () => string;
  readonly pendingStorage?: PendingEngagementStorage;
  readonly children?: (controls: JSX.Element, menuActions: readonly ContentAction[]) => JSX.Element;
  /**
   * `sheet` (feeds) opens the thread in the side panel from the comment pill.
   * `inline` (the post page) lays the thread under the post with a one-line
   * comment box: pinned to the phone's bottom edge, directly under the post
   * on wider screens.
   */
  readonly presentation?: "sheet" | "inline";
  /** Video post pages place new local roots before the server's existing roots. */
  readonly newestFirstRoots?: boolean;
  /** Inline only: who the viewer comments as, drawn at the start of the box. */
  readonly composerIdentity?: JSX.Element;
  /**
   * Inline only: the viewer is signed in but not a member. The comment box is
   * replaced by Join to comment, and Reply leads to the same place.
   */
  readonly joinHref?: string;
  readonly target?: CommentNavigation;
  readonly readTarget?: CommentNavigationReader;
  readonly votesReady?: boolean;
}

type ComposeTarget =
  | { readonly kind: "comment" }
  | { readonly kind: "reply"; readonly parentId: string };

function defaultIdempotencyKey(): string {
  return crypto.randomUUID();
}

type ReportTarget =
  | { readonly kind: "post" }
  | { readonly kind: "comment"; readonly item: CommentThreadItem };

/** The comment pill's shape, so Reply reads as the same family of control. */
const replyPillClass = "inline-flex h-11 w-fit cursor-pointer items-center gap-2 rounded-full border border-border-soft bg-background px-4 text-base font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function reconcileVideoRoot(items: readonly CommentThreadItem[], root: CommentThreadItem, pendingId: string): readonly CommentThreadItem[] {
  const remaining = items.filter(item => item.id !== pendingId);
  // A loaded projection retains its current moderation, replies and position.
  // Replaying a creation receipt must not replace that fresher readback.
  return remaining.some(item => item.id === root.id) ? remaining : [root, ...remaining];
}

export function PostEngagement(props: PostEngagementProps) {
  const targetedContext = useTargetedPersona();
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
  const [reportTarget, setReportTarget] = createSignal<ReportTarget>();
  const [actionBusyId, setActionBusyId] = createSignal<string>();
  const inline = untrack(() => props.presentation === "inline");
  let composerInput: HTMLInputElement | undefined;
  let threadElement: HTMLElement | undefined;

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

  const thread = untrack(() => createCommentThreadController({postId:props.post.id,readComments:props.readComments,comments,setComments,target:props.target,readTarget:props.readTarget,onTargetRefused:targetedContext?.refuse}));
  createEffect(() => props.personaId, (_, previous) => {
    if (previous !== undefined && props.target) { thread.clear(); void thread.refresh(new AbortController().signal); }
  });
  let voteSyncActive = true;
  onCleanup(() => { voteSyncActive = false; });
  createEffect(() => [props.post.viewerVote, props.votesReady] as const, ([value, ready]) => {
    queueMicrotask(() => { if (voteSyncActive && ready !== false) setViewerVote(value); });
  });
  const loadThread = () => {
    if (!props.target && (props.initialComments === undefined || props.readComments !== undefined)) void thread.load();
  };
  const openComments = () => {
    if (inline) {
      // The thread is already on the page; the pill takes the viewer to the box.
      if (composerInput && !composerInput.disabled) composerInput.focus();
      else threadElement?.scrollIntoView?.({ block: "start" });
      return;
    }
    setPanelOpen(true);
    setIssue(undefined);
    loadThread();
  };
  if (inline) onSettled(loadThread);

  const selectReply = (item: CommentThreadItem) => {
    if (!canReplyToComment(item)) {
      if (item.depth >= 8) setIssue({ kind: "reply_depth_exceeded" });
      return;
    }
    setComposeTarget({ kind: "reply", parentId: item.id });
    setDraft("");
    if (inline) queueMicrotask(() => composerInput?.focus());
  };

  const prepareRecord = async (
    slot: string,
    createAction: (idempotencyKey: string) => PendingEngagementAction,
  ): Promise<PendingEngagementRecord | null> => {
    const prepared = await preparePendingEngagementRecord({
      storage: pendingStorage,
      slot,
      principalId: props.principalId,
      postId: props.post.id,
      generateKey,
      createAction,
    });
    switch (prepared.kind) {
      case "ready": return prepared.record;
      case "rejected":
        setDiscardableRecord(prepared.record);
        setIssue(issueFromPending(prepared.issue));
        return null;
      case "occupied":
        setRetainedRecord(prepared.record);
        setIssue({ kind: "pending_action" });
        return null;
      case "storage_failed":
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
    const retainedIssue = definitiveRejectionIssue(error, projected);
    if (retainedIssue === undefined) return;
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
        // Every retained envelope must still decode before the view trusts it.
        await Promise.all(records.map(record => decodePendingEngagementAction(record.envelope)));
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
    // Authorship is persona-scoped. Refuse locally rather than sending a
    // command the contract cannot express without an author.
    const personaId = props.personaId;
    if (personaId === undefined) {
      setIssue({ kind: "persona_required" });
      return;
    }
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
      ? { kind: "reply", commentId: parent.id, personaId, body, idempotencyKey: key }
      : { kind: "comment", postId: props.post.id, personaId, body, idempotencyKey: key });
    if (record === null) {
      setSubmissionBusy(false);
      return;
    }
    const retained = await decodePendingEngagementAction(record.envelope);
    const retainedBody = retained.kind === "comment" || retained.kind === "reply" ? retained.body : body;
    const pending = submittingComment(retainedBody, depth, parentId, retained.idempotencyKey);
    const newestRoot = props.newestFirstRoots === true && parentId === null;
    setComments(items => {
      const remaining = items.filter(item => item.id !== pending.id);
      return newestRoot ? [pending, ...remaining] : [...remaining, pending];
    });
    try {
      const response = retained.kind === "reply"
        ? await transport.createReply(record.envelope)
        : await transport.createComment(record.envelope);
      const settled = settledComment(pending, response);
      const rootAlreadyLoaded = newestRoot && comments().some(item => item.id === settled.id);
      setComments(items => {
        if (newestRoot) return reconcileVideoRoot(items, settled, pending.id);
        let next = items.map(item => item.id === pending.id ? settled : item);
        if (settled.state === "published" && parentId) next = [...adjustReplyCount(next, parentId, 1)];
        return next;
      });
      if (settled.state === "published" && !rootAlreadyLoaded) setCommentCount(value => value + 1);
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
    if (voteBusy() || props.votesReady === false) return;
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

  const [postReportBusy, setPostReportBusy] = createSignal(false);
  const [postReported, setPostReported] = createSignal(false);
  const closeReport = () => setReportTarget(undefined);
  const reportPost = async (reasonCode: CommentReportReason) => {
    if (postReportBusy()) return;
    setPostReportBusy(true);
    setIssue(undefined);
    const record = await prepareRecord(postReportSlot(props.principalId, props.post.id), key => ({
      kind: "post_report", postId: props.post.id, reasonCode, idempotencyKey: key,
    }));
    try {
      if (record === null) return;
      await transport.reportPost(record.envelope);
      setPostReported(true);
      closeReport();
      await resolveRecord(record);
    } catch (error) {
      if (record) await retainFailure(record, error);
    } finally {
      setPostReportBusy(false);
    }
  };
  const postMenuActions = (): readonly ContentAction[] => props.canReportPost
    ? [{ label: "Report", disabled: postReportBusy(), run: () => setReportTarget({ kind: "post" }) }]
    : [];

  const report = async (item: CommentThreadItem, reasonCode: CommentReportReason) => {
    if (actionBusyId() || !commentCountsAsPublished(item) || !isCommentAddressable(item)) return;
    setActionBusyId(item.id);
    setIssue(undefined);
    const record = await prepareRecord(commentReportSlot(props.principalId, props.post.id, item.id), key => ({
      kind: "report",
      commentId: item.id,
      reasonCode,
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
      closeReport();
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
          const newestRoot = props.newestFirstRoots === true && action.kind === "comment";
          const rootAlreadyLoaded = newestRoot && comments().some(item => item.id === settled.id);
          if (action.kind === "comment" || parent !== undefined) {
            setComments(items => {
              let next = newestRoot
                ? reconcileVideoRoot(items, settled, pending.id)
                : [...items.filter(item => item.id !== pending.id), settled];
              if (settled.state === "published" && parent !== undefined) {
                next = [...adjustReplyCount(next, parent.id, 1)];
              }
              return next;
            });
          }
          if (settled.state === "published" && !rootAlreadyLoaded) setCommentCount(value => value + 1);
          break;
        }
        case "post_report": {
          await transport.reportPost(record.envelope);
          setPostReported(true);
          closeReport();
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

  const commentMenuActions = (item: CommentThreadItem): readonly ContentAction[] => {
    const actions: ContentAction[] = [];
    const add = (label: string, run: () => void) => actions.push({ label, run, disabled: actionBusyId() === item.id });
    if (commentCountsAsPublished(item) && isCommentAddressable(item)) add("Report", () => setReportTarget({ kind: "comment", item }));
    return actions;
  };

  const commentModerationActions = (item: CommentThreadItem): readonly ContentAction[] => {
    const actions: ContentAction[] = [];
    const add = (label: string, run: () => void) => actions.push({ label, run, disabled: actionBusyId() === item.id });
    if (props.canModerate && props.communityId && item.caseRef) {
      if (item.state === "manual_review") {
        add("Approve", () => void moderate(item, "approve_as_general"));
        add("Reject", () => void moderate(item, "reject"));
      } else if (item.state === "published" || item.state === "restored") {
        add("Dismiss report", () => void moderate(item, "dismiss_report"));
        add("Hide", () => void moderate(item, "hide"));
      } else if (item.state === "hidden" || item.state === "blocked") {
        add("Restore", () => void moderate(item, "restore"));
      }
    }
    return actions;
  };

  const controls = () => (
    <div class="flex flex-wrap items-center gap-3" data-post-engagement-controls data-viewer-control>
      <EngagementControls busy={voteBusy()} onVote={props.votesReady === false ? undefined : vote} score={score()}
        viewerVote={viewerVote() === 1 ? "up" : viewerVote() === -1 ? "down" : null}
        commentCount={commentCount()} onComment={openComments} />
      <Show when={!props.children}><ContentOverflowMenu label="Post options" actions={postMenuActions()} /></Show>
      <Show when={postReported()}><Type role="status" variant="caption">Post reported</Type></Show>
      {/* Inline, these are said in the comment bar, where the viewer is acting. */}
      <Show when={!inline && issue()}>
        {(currentIssue) => <Type role="alert" variant="caption">{engagementIssueMessage(currentIssue())}</Type>}
      </Show>
      <Show when={!inline && discardableRecord()?.issue && !panelOpen()}>
        <Button onClick={() => void discardRejected()} size="sm" type="button" variant="outline">Discard rejected action</Button>
      </Show>
      <Show when={!inline && retainedRecord() && !panelOpen()}>
        <Button disabled={retainedBusy()} onClick={() => void retryRetained()} size="sm" type="button" variant="outline">Retry retained request</Button>
      </Show>
    </div>
  );

  const locale = usePageUiLocale();
  /** Names whom a reply answers when the loaded parent says so. */
  const replyingLabel = (parent: CommentThreadItem): string => {
    const label = parent.authorProfile !== undefined ? publicProfileLabel(parent.authorProfile, locale) : parent.authorLabel;
    return label ? `Replying to ${label}` : `Replying at depth ${parent.depth + 1}`;
  };

  const statusLines = (spacing: string) => (
    <>
      <Show when={issue()}>
        {(currentIssue) => <Type class={spacing} role="alert" variant="caption">{engagementIssueMessage(currentIssue())}</Type>}
      </Show>
      <Show when={discardableRecord()?.issue}>
        <Button class={spacing} onClick={() => void discardRejected()} size="sm" type="button" variant="outline">Discard rejected action</Button>
      </Show>
      <Show when={retainedRecord()}>
        <Button class={spacing} disabled={retainedBusy()} onClick={() => void retryRetained()} size="sm" type="button" variant="outline">Retry retained request</Button>
      </Show>
    </>
  );

  const repliesPage = (item: CommentThreadItem) => thread.pages()[`parent:${item.id}`];
  const canLoadReplies = (item: CommentThreadItem) => item.replyCount > 0 && (repliesPage(item)?.state !== "ready" || repliesPage(item)?.cursor !== null);
  const canRefresh = (item: CommentThreadItem) => commentCountsAsPublished(item) && !isCommentAddressable(item) && item.submissionId !== null;
  /** One level on the post page: a reply carries no Reply of its own. */
  const showsInlineReply = (item: CommentThreadItem) => item.depth === 0 && canReplyToComment(item);

  const commentRowActions = (item: CommentThreadItem, showReply: boolean) => (
    <>
      <For each={commentModerationActions(item)}>{action => <Button disabled={action.disabled} onClick={action.run} size="sm" type="button" variant="outline">{action.label}</Button>}</For>
      <Show when={canLoadReplies(item)}>
        <Button disabled={repliesPage(item)?.state === "loading"} onClick={() => void thread.load(item.id)} size="sm" type="button" variant="outline">
          {repliesPage(item)?.state === "loading" ? "Loading replies…" : repliesPage(item)?.state === "error" ? "Retry replies" : repliesPage(item) ? "More replies" : "View replies"}
        </Button>
      </Show>
      <Show when={showReply}>{props.joinHref === undefined
        ? <button class={replyPillClass} onClick={() => selectReply(item)} type="button"><IconChatCircle aria-hidden="true" class="size-[23px]" />Reply</button>
        : <a class={replyPillClass} href={props.joinHref}><IconChatCircle aria-hidden="true" class="size-[23px]" />Reply</a>}
      </Show>
      <Show when={canRefresh(item)}>
        <Button disabled={actionBusyId() === item.id} onClick={() => void refreshComment(item)} size="sm" type="button" variant="outline">Refresh comment</Button>
      </Show>
    </>
  );

  const panel = () => (
    <FeedSidePanel
      closeLabel="Close comments"
      description={`${commentCount()} comments reported by the post`}
      onOpenChange={open => { setPanelOpen(open); if (!open && reportTarget()?.kind === "comment") closeReport(); }}
      open={panelOpen()}
      title="Comments"
    >
      {/* A comment's report reasons open inside the panel; opening a second
          sheet from a menu inside this one would be dismissed as it opens. */}
      <Show when={reportTarget()?.kind === "comment"} fallback={
      <div class="flex h-full flex-col">
        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4" data-comment-thread>
          <Show
            when={comments().length > 0}
            fallback={<Type variant="body">{thread.pages().root?.state === "loading" ? "Loading comments…" : thread.pages().root?.state === "error" ? "Comments could not be loaded." : "No comments yet."}</Type>}
          >
            <div class="flex flex-col gap-3">
              <For each={thread.ordered()}>{item => (
                <CommentCard item={item} onAgeVerified={thread.refresh} menuActions={commentMenuActions(item)}>
                    <div class="flex flex-wrap gap-2">
                      <For each={commentModerationActions(item)}>{action => <Button disabled={action.disabled} onClick={action.run} size="sm" type="button" variant="outline">{action.label}</Button>}</For>
                      <Show when={item.replyCount > 0 && (thread.pages()[`parent:${item.id}`]?.state !== "ready" || thread.pages()[`parent:${item.id}`]?.cursor !== null)}>
                        <Button disabled={thread.pages()[`parent:${item.id}`]?.state === "loading"} onClick={() => void thread.load(item.id)} size="sm" type="button" variant="outline">
                          {thread.pages()[`parent:${item.id}`]?.state === "loading" ? "Loading replies…" : thread.pages()[`parent:${item.id}`]?.state === "error" ? "Retry replies" : thread.pages()[`parent:${item.id}`] ? "More replies" : "View replies"}
                        </Button>
                      </Show>
                      <Show when={canReplyToComment(item)}>
                        <Button onClick={() => selectReply(item)} size="sm" type="button" variant="outline">Reply</Button>
                      </Show>
                      <Show when={commentCountsAsPublished(item) && !isCommentAddressable(item) && item.submissionId !== null}>
                        <Button disabled={actionBusyId() === item.id} onClick={() => void refreshComment(item)} size="sm" type="button" variant="outline">Refresh comment</Button>
                      </Show>
                    </div>
                </CommentCard>
              )}</For>
            </div>
          </Show>
          <Show when={thread.pages().root?.state === "error" || (thread.pages().root?.state === "ready" && thread.pages().root?.cursor !== null)}>
            <Button onClick={() => void thread.load()} size="sm" type="button" variant="outline">{thread.pages().root?.state === "error" ? "Retry comments" : "More comments"}</Button>
          </Show>
        </div>
        <div class="shrink-0 border-t border-border-soft px-5 py-4">
          <Show when={composeTarget().kind === "reply" && targetParent()}>
            {(parent) => (
              <div class="mb-2 flex items-center justify-between gap-3">
                <Type variant="caption">{replyingLabel(parent())}</Type>
                <Button onClick={() => setComposeTarget({ kind: "comment" })} size="sm" type="button" variant="ghost">Cancel reply</Button>
              </div>
            )}
          </Show>
          <FormattedTextarea
            aria-label={composeTarget().kind === "reply" ? "Write a reply" : "Write a comment"}
            disabled={submissionBusy() || props.personaId === undefined}
            onChange={updateDraft}
            placeholder={composeTarget().kind === "reply" ? "Write a reply…" : "Join the conversation…"}
            value={draft()}
          />
          {/* Said before the viewer types, not after they try to post. */}
          <Show when={props.personaId === undefined}>
            <Type class="mt-2" variant="caption">Choose a profile to comment as.</Type>
          </Show>
          <div class="mt-3 flex flex-wrap items-center justify-end gap-3">
            <Button disabled={submissionBusy() || draft().trim() === "" || props.personaId === undefined} onClick={() => void submit()} type="button">
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
      }>
        <div class="flex h-full flex-col overflow-y-auto" data-comment-report>
          <div class="flex items-center justify-between gap-3 px-5 pt-4">
            <div class="min-w-0">
              <Type as="h3" variant="body-strong">{reportTitle()}</Type>
              <Type variant="caption">{reportDescription()}</Type>
            </div>
            <Button onClick={closeReport} size="sm" type="button" variant="ghost">Back to comments</Button>
          </div>
          {reportReasons()}
        </div>
      </Show>
    </FeedSidePanel>
  );

  // Reporting is a list of reasons; one tap sends the report under the same
  // retained-key envelope as before, so a retry replays rather than duplicates.
  const reportTitle = () => reportTarget()?.kind === "comment" ? "Report comment" : "Report post";
  const reportDescription = () => reportTarget()?.kind === "comment"
    ? "Choose why you are reporting this comment. It is sent when you choose."
    : "Choose why you are reporting this post. It is sent when you choose.";
  const reportBusy = () => {
    const target = reportTarget();
    return target?.kind === "comment" ? actionBusyId() === target.item.id : postReportBusy();
  };
  const sendReport = (reasonCode: CommentReportReason) => {
    const target = reportTarget();
    if (target === undefined || reportBusy()) return;
    if (target.kind === "post") void reportPost(reasonCode);
    else void report(target.item, reasonCode);
  };
  const reportReasons = () => (
    <div class="flex flex-col gap-1 px-5 pb-5 pt-2" data-report-reasons>
      <ul aria-label="Report reasons" class="flex flex-col gap-1">
        <For each={REPORT_REASONS}>{reason => (
          <li><button class="flex min-h-11 w-full items-center rounded-[var(--radius-lg)] px-3 text-start text-base text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            disabled={reportBusy()} onClick={() => sendReport(reason.value)} type="button">{reason.label}</button></li>
        )}</For>
      </ul>
      {statusLines("mt-2")}
    </div>
  );

  const reportPanel = () => (
    <FeedSidePanel closeLabel="Close report" title={reportTitle()} description={reportDescription()} open onOpenChange={open => { if (!open) closeReport(); }}>
      {reportReasons()}
    </FeedSidePanel>
  );

  const reportModal = () => (
    <Modal onOpenChange={open => { if (!open) closeReport(); }} open={reportTarget() !== undefined}>
      <ModalContent class="flex max-h-[80dvh] flex-col rounded-t-[var(--radius-3xl)] px-0 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:rounded-[var(--radius-xl)] sm:p-0" mobileSide="bottom">
        <ModalHeader class="px-5 pb-2 text-start sm:px-6 sm:pt-6">
          <ModalTitle leading="tight" variant="h3">{reportTitle()}</ModalTitle>
          <ModalDescription>{reportDescription()}</ModalDescription>
        </ModalHeader>
        {reportReasons()}
      </ModalContent>
    </Modal>
  );

  const inlineEmptyText = () => {
    const root = thread.pages().root?.state;
    if (root === "error") return "Comments could not be loaded.";
    if (root === "loading" || (root === undefined && props.readComments !== undefined)) return "Loading comments…";
    if (root === undefined && props.initialComments === undefined) return "Loading comments…";
    return "No comments yet.";
  };

  const inlineComposer = () => (
    <>
      <Show when={composeTarget().kind === "reply" && targetParent()}>
        {(parent) => (
          <div class="mb-2 flex items-center justify-between gap-3">
            <Type class="min-w-0 truncate" variant="caption">{replyingLabel(parent())}</Type>
            <Button onClick={() => setComposeTarget({ kind: "comment" })} size="sm" type="button" variant="ghost">Cancel reply</Button>
          </div>
        )}
      </Show>
      {statusLines("mb-2")}
      <form class="flex items-center gap-2" onSubmit={event => { event.preventDefault(); void submit(); }}>
        {props.composerIdentity}
        <input
          aria-label={composeTarget().kind === "reply" ? "Write a reply" : "Write a comment"}
          autocomplete="off"
          class="h-11 min-w-0 flex-1 rounded-[var(--radius-lg)] border border-input bg-card px-4 text-base leading-6 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
          disabled={submissionBusy() || props.personaId === undefined}
          enterkeyhint="send"
          onInput={event => updateDraft(event.currentTarget.value)}
          placeholder={props.personaId === undefined ? "Choose a profile to comment" : composeTarget().kind === "reply" ? "Add a reply" : "Add a comment"}
          ref={element => { composerInput = element; }}
          type="text"
          value={draft()}
        />
        <button
          aria-busy={submissionBusy() ? "true" : undefined}
          aria-label={composeTarget().kind === "reply" ? "Post reply" : "Post comment"}
          class="grid size-11 shrink-0 place-items-center rounded-[var(--radius-lg)] bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:pointer-events-none disabled:opacity-50"
          disabled={submissionBusy() || draft().trim() === "" || props.personaId === undefined}
          type="submit"
        ><IconArrowUp aria-hidden="true" class="size-5" /></button>
      </form>
    </>
  );

  const inlineBar = () => (
    <div class="border-t border-border-soft bg-background px-5 pb-4 pt-3 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:pb-[calc(1rem+env(safe-area-inset-bottom))]" data-comment-bar>
      <Show when={props.joinHref} fallback={inlineComposer()}>
        {href => <>{statusLines("mb-2")}<a class={buttonVariants({ class: "w-full" })} href={href()}>Join to comment</a></>}
      </Show>
    </div>
  );

  const inlineThread = () => (
    <section ref={threadElement} aria-label="Comments" class="flex min-w-0 flex-col gap-5 pt-5" data-comment-thread={props.post.id}>
      <Show when={thread.target()}><a class={buttonVariants({ variant: "secondary", size: "sm", class: "w-fit" })} href={typeof location === "undefined" ? "/" : location.pathname} onClick={() => void thread.reset()}>View all comments</a></Show>
      <Show when={thread.earlier(null)}><p class="text-sm text-muted-foreground">Earlier comments are omitted.</p></Show>
      <Show when={thread.targetIssue()}>{issue => <><Show when={issue() === "age"} fallback={<p role="alert">{issue() === "missing" ? "This comment is not available." : "This comment thread could not be loaded."}</p>}><AgeAccessPrompt onVerified={thread.refresh} /></Show><Button onClick={() => void thread.refresh(new AbortController().signal)} size="sm" variant="secondary">Retry comment thread</Button></>}</Show>
      <Show when={comments().length > 0} fallback={<Type variant="caption">{inlineEmptyText()}</Type>}>
        <For each={thread.ordered()}>{item => (
          <div tabindex={-1} ref={element => thread.focus(element, item.id)} data-inline-comment={item.id}>
          <CommentCard item={item} menuActions={commentMenuActions(item)} onAgeVerified={thread.refresh} variant="row">
            <Show when={thread.earlier(item.id)}><p class="text-sm text-muted-foreground">Earlier replies are omitted.</p></Show>
            <Show when={showsInlineReply(item) || canLoadReplies(item) || canRefresh(item) || commentModerationActions(item).length > 0}>
              <div class="flex flex-wrap items-center gap-2">{commentRowActions(item, showsInlineReply(item))}</div>
            </Show>
          </CommentCard>
          </div>
        )}</For>
      </Show>
      <Show when={thread.pages().root?.state === "error" || (thread.pages().root?.state === "ready" && thread.pages().root?.cursor !== null)}>
        <Button class="w-fit" onClick={() => void thread.load()} size="sm" type="button" variant="outline">{thread.pages().root?.state === "error" ? "Retry comments" : "More comments"}</Button>
      </Show>
    </section>
  );

  if (inline) {
    return (
      <div class="flex min-w-0 flex-col" data-post-engagement="inline">
        {props.children ? props.children(controls(), postMenuActions()) : controls()}
        {inlineBar()}
        {inlineThread()}
        {reportModal()}
      </div>
    );
  }

  return (
    <FeedPanelLayout panel={reportTarget()?.kind === "post" ? reportPanel() : panelOpen() ? panel() : undefined}>
      {props.children ? props.children(controls(), postMenuActions()) : controls()}
    </FeedPanelLayout>
  );
}
