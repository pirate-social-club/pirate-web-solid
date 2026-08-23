/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";

import type { PendingSubmissionStorage } from "./pending-submission";
import { PostComposerSubmission } from "./post-composer-submission";
import { initialPostComposerState, type PostComposerState } from "./post-composer-state";
import {
  createTextSubmissionCoordinator,
  type TextSubmissionTransport,
} from "./text-submission-transport";
import type { TextContentSubmissionRequestEnvelopeV1 } from "./text-submission-contract";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  TextField,
  TextFieldDescription,
  TextFieldInput,
  TextFieldLabel,
  Type,
} from "../../../design-system";

export interface CreatePostDraft {
  readonly communityId: string;
  readonly title: string;
  readonly body: string;
  readonly idempotencyKey: string;
}

/** Keep request construction pure so the contract boundary is easy to test. */
export function buildCreatePostRequest(draft: CreatePostDraft): TextContentSubmissionRequestEnvelopeV1 {
  return {
    path: { communityId: draft.communityId.trim() },
    body: {
      idempotency_key: draft.idempotencyKey,
      post_type: "text",
      authorship_mode: "human_direct",
      identity_mode: "public",
      visibility: "public",
      title: draft.title.trim() === "" ? null : draft.title.trim(),
      body: draft.body.trim(),
    },
  };
}

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `solid-post-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface CreatePostDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPublished?: () => void;
  readonly principalId?: string;
  readonly storage?: PendingSubmissionStorage;
  readonly transport?: TextSubmissionTransport;
  readonly origin?: string | URL;
  readonly fetchImpl?: typeof fetch;
}

export function CreatePostDialog(props: CreatePostDialogProps): JSX.Element {
  const [communityId, setCommunityId] = createSignal("");
  const [title, setTitle] = createSignal("");
  const [body, setBody] = createSignal("");
  const [error, setError] = createSignal("");
  const [state, setState] = createSignal<PostComposerState>(initialPostComposerState);
  const coordinator = createTextSubmissionCoordinator({
    principalId: props.principalId,
    storage: props.storage,
    transport: props.transport,
    origin: props.origin,
    fetchImpl: props.fetchImpl,
    onStateChange: setState,
  });

  void coordinator.restore().catch(() => {
    setState({ status: "transport_failure", reason: "durable_storage_failed" });
  });

  function close(open: boolean): void {
    if (!open) {
      setError("");
      if (state().status === "published" || state().status === "manual_review" || state().status === "blocked" || state().status === "abandoned") {
        coordinator.startNewDraft();
        setCommunityId("");
        setTitle("");
        setBody("");
      }
    }
    props.onOpenChange(open);
  }

  function startNewDraft(): void {
    coordinator.startNewDraft();
    setCommunityId("");
    setTitle("");
    setBody("");
    setError("");
  }

  async function discardAndEdit(): Promise<void> {
    setError("");
    try {
      const draft = await coordinator.discardRejectedRequest();
      setCommunityId(draft.communityId);
      setTitle(draft.title);
      setBody(draft.body);
    } catch (discardError) {
      setError(discardError instanceof Error ? discardError.message : "The saved request could not be discarded safely.");
    }
  }

  async function submit(): Promise<void> {
    const community = communityId().trim();
    const content = body().trim();
    if (community === "" || content === "") {
      setError("Choose a community and write something before publishing.");
      return;
    }
    setError("");
    try {
      const snapshot = await coordinator.submit(buildCreatePostRequest({
        communityId: community,
        title: title(),
        body: content,
        idempotencyKey: createIdempotencyKey(),
      }));
      if (snapshot.status === "published") props.onPublished?.();
    } catch (submissionError) {
      if (coordinator.state.status === "transport_failure") {
        setError("Your post could not be prepared for safe retry.");
      } else if (coordinator.state.status === "reconciling") {
        setError("The request result is uncertain; the saved request can be checked again safely.");
      } else if (submissionError instanceof Error) {
        setError(submissionError.message);
      }
    }
  }

  async function retry(): Promise<void> {
    setError("");
    try {
      if (state().status === "reconciling") {
        const snapshot = await coordinator.reconcile();
        if (snapshot.status === "published") props.onPublished?.();
      } else {
        await submit();
      }
    } catch {
      if (coordinator.state.status === "reconciling") setError("The request result is still uncertain. Try checking again.");
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={close}>
      <DialogContent class="sm:w-[min(100%-2rem,34rem)]">
        <DialogHeader>
          <DialogTitle>Create a post</DialogTitle>
          <DialogDescription>Start a conversation in a community you belong to.</DialogDescription>
        </DialogHeader>
        <Show when={props.open}>
          <form class="grid gap-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            <TextField name="community-id" value={communityId()} onChange={setCommunityId}>
              <TextFieldLabel>Community ID</TextFieldLabel>
              <TextFieldInput autocomplete="off" placeholder="The community identifier" />
              <TextFieldDescription>Posts are community-scoped. A friendly community picker will replace this field.</TextFieldDescription>
            </TextField>
            <TextField name="post-title" value={title()} onChange={setTitle}>
              <TextFieldLabel>Title <span class="font-normal text-muted-foreground">(optional)</span></TextFieldLabel>
              <TextFieldInput autocomplete="off" placeholder="Give your post a clear title" />
            </TextField>
            <label class="grid gap-2 text-sm font-medium" for="create-post-body">
              <span>Post</span>
              <textarea
                id="create-post-body"
                name="post-body"
                class="min-h-32 w-full resize-y rounded-xl border border-input bg-background px-3 py-3 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                value={body()}
                onInput={(event) => setBody(event.currentTarget.value)}
                placeholder="What do you want to share?"
              />
            </label>
            <Show when={error().length > 0}><p class="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm" role="alert">{error()}</p></Show>
            <Show when={state().status !== "editing"}>
              <PostComposerSubmission
                onDiscardAndEdit={() => void discardAndEdit()}
                onNewDraft={startNewDraft}
                onRetry={() => void retry()}
                onResolveOldest={() => { coordinator.resolveOldestPending(); }}
                state={state()}
              />
            </Show>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)}>Cancel</Button>
              <Button
                type="submit"
                disabled={state().status !== "editing"}
              >
                {state().status === "submitting" ? "Submitting…" : "Publish post"}
              </Button>
            </DialogFooter>
          </form>
        </Show>
        <Type as="p" variant="caption" class="text-muted-foreground">Your post uses a same-origin session and the frozen text submission contract.</Type>
      </DialogContent>
    </Dialog>
  );
}
