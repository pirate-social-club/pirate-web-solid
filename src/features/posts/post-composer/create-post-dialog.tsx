/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";
import type { PostCommunitiesCommunityIdPostsInput, PirateApiClient } from "@pirate/api-client";

import { createSessionApiClient } from "../../../api/client.ts";
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

export type CreatePostClient = Pick<PirateApiClient, "post_communitiesCommunityIdPosts">;

export interface CreatePostDraft {
  readonly communityId: string;
  readonly title: string;
  readonly body: string;
  readonly idempotencyKey: string;
}

/** Keep request construction pure so the contract boundary is easy to test. */
export function buildCreatePostRequest(draft: CreatePostDraft): PostCommunitiesCommunityIdPostsInput {
  return {
    path: { communityId: draft.communityId.trim() },
    body: {
      idempotency_key: draft.idempotencyKey,
      post_type: "text",
      authorship_mode: "human_direct",
      identity_mode: "public",
      visibility: "public",
      publish_mode: "async",
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
  readonly client?: CreatePostClient;
}

export function CreatePostDialog(props: CreatePostDialogProps): JSX.Element {
  const [communityId, setCommunityId] = createSignal("");
  const [title, setTitle] = createSignal("");
  const [body, setBody] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [published, setPublished] = createSignal(false);

  function close(open: boolean): void {
    if (!open) {
      setError("");
      setPublished(false);
    }
    props.onOpenChange(open);
  }

  async function submit(): Promise<void> {
    const community = communityId().trim();
    const content = body().trim();
    if (community === "" || content === "") {
      setError("Choose a community and write something before publishing.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const client = props.client ?? createSessionApiClient();
      await client.post_communitiesCommunityIdPosts(buildCreatePostRequest({
        communityId: community,
        title: title(),
        body: content,
        idempotencyKey: createIdempotencyKey(),
      }));
      setPublished(true);
      props.onPublished?.();
    } catch {
      setError("Your post could not be submitted yet. Check the community ID and try again.");
    } finally {
      setBusy(false);
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
            <Show when={published()}><p class="rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm" role="status">Post submitted. The feed will show it after api-next finishes processing.</p></Show>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)}>Cancel</Button>
              <Button type="submit" disabled={busy()}>{busy() ? "Publishing…" : "Publish post"}</Button>
            </DialogFooter>
          </form>
        </Show>
        <Type as="p" variant="caption" class="text-muted-foreground">Your post uses a same-origin session and the existing community post contract.</Type>
      </DialogContent>
    </Dialog>
  );
}
