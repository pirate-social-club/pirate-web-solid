import { createRoot, createSignal } from "solid-js";
import { expect, test } from "vitest";
import { createCommentThreadController } from "./comment-thread-controller.ts";
import type { CommentThreadItem } from "./post-engagement-model.ts";
import type { CommentThreadPage } from "./comment-thread-api.ts";

test("age refresh replaces locked pages while retaining local drafts and refusing a late disposed read", async () => {
  let verified = false;
  const locked: CommentThreadPage = {
    items: [
      {
        kind: "age_locked",
        content_rating: "adult_18",
        next_action: { kind: "verify_minimum_age", minimum_age: 18 },
      },
    ],
    next_cursor: null,
  };
  const published: CommentThreadPage = {
    items: [
      {
        comment_id: "comment-a",
        parent_comment_id: null,
        body: "Authorized comment",
        depth: 0,
        reply_count: 0,
        status: "published",
        content_rating: "adult_18",
        created_at: "2026-09-14T00:00:00Z",
        author_persona: null,
      },
    ],
    next_cursor: null,
  };
  let dispose = () => {};
  const { controller, comments, draft } = createRoot((cleanup) => {
    dispose = cleanup;
    const [comments, setComments] = createSignal<readonly CommentThreadItem[]>([]);
    const [draft] = createSignal("Unsubmitted reply");
    return {
      comments,
      draft,
      controller: createCommentThreadController({
        postId: "post-a",
        comments,
        setComments,
        readComments: async () => (verified ? published : locked),
      }),
    };
  });
  try {
    await controller.load();
    expect(comments()[0]?.state).toBe("age_locked");
    verified = true;
    await controller.refresh(new AbortController().signal);
    expect(comments().map((item) => item.body)).toEqual(["Authorized comment"]);
    expect(draft()).toBe("Unsubmitted reply");
    dispose();
    verified = false;
    await controller.refresh(new AbortController().signal);
    expect(comments().map((item) => item.body)).toEqual(["Authorized comment"]);
  } finally {
    dispose();
  }
});
