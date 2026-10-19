import type { CommentNavigation } from "./comment-navigation-api.ts";
import type { PublicPostContentResponse } from "../posts/public-post/public-post-route.model.ts";

/** Synthetic contract inputs for source tests; never mounted by product routes. */
export function navigationFixture(depth = 2, postPath = "/posts/thread"): CommentNavigation {
  const chain = Array.from({ length: depth + 1 }, (_, index) => `branch-${index}`);
  return { kind: "available", post_id: "post", community_id: "community", post_path: postPath, target_comment_id: chain[depth]!, ancestor_comment_ids: chain.slice(0, -1),
    windows: chain.map((id, index) => ({ parent_comment_id: index === 0 ? null : chain[index - 1]!, branch_comment_id: id, earlier_items_omitted: true, next_cursor: `continuation-${index}`,
      items: Array.from({ length: 20 }, (_, sibling) => ({ comment_id: sibling === 0 ? id : `sibling-${index}-${sibling}`, parent_comment_id: index === 0 ? null : chain[index - 1]!, depth: index, body: sibling === 0 ? `Authorized branch ${index}` : `Sibling ${index}/${sibling}`, author_persona: null, reply_count: sibling === 0 && index < depth ? 41 : 0, created_at: "2026-10-16T12:00:00Z", status: "published" as const, content_rating: "general" as const })) })) };
}
export function postFixture(kind: "text" | "song" | "video", playback: "pending" | "unavailable" | "ready" = "pending"): PublicPostContentResponse {
  const fixture = { kind: "content", post_id: "post", content: { post: { id: "post", object: "post", community: "community", post_type: kind, status: "published", identity_mode: "public", visibility: "public", title: "Thread destination", body: "Published body", age_gate_policy: "none", created: 1792152000 }, resolved_locale: "en", translation_state: "same_language", translated_title: null, translated_body: null, upvote_count: 0, downvote_count: 0, comment_count: 41,
    ...(kind === "video" ? { video: { track: "video", playback: { status: playback }, thumbnail: { status: "unavailable" } } } : {}),
  }, route: kind === "video" ? null : { canonical_path: "/posts/thread", activity_paths: { study: "/posts/thread/study", karaoke: "/posts/thread/karaoke", karaoke_leaderboard: "/posts/thread/karaoke/leaderboard" } } };
  // SAFETY: controller/render tests supply the fields those boundaries consume;
  // generated wire validation is exercised separately, never bypassed in product code.
  return JSON.parse(JSON.stringify(fixture)) as PublicPostContentResponse;
}
