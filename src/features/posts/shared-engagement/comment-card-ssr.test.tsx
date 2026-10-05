import { CommunityPostCard } from "../../community/page-shell/page-shell.tsx";
import { relativeTime } from "./relative-time.ts";
import { renderToString } from "@solidjs/web";
import { expect, test } from "vitest";
import { CommentCard } from "./comment-card.tsx";

// A caller may retain stale fields while an age decision changes. The shared
// card must not put those fields into public HTML, even without a controller.
test("age-locked comments redact retained content and identity in SSR", () => {
  const html = renderToString(() => <CommentCard item={{ id: "locked", submissionId: null, parentId: null,
    body: "restricted-content-marker", authorLabel: "restricted-identity-marker", authorAvatarRef: "/restricted-avatar-marker", createdAt: "2026-10-05T08:00:00Z",
    depth: 0, replyCount: 0, state: "age_locked", caseRef: null, href: null }}
    communityLabel="restricted-community-marker" postContext={{ title: "restricted-title-marker", href: "/restricted-target-marker" }}
    menuActions={[{ label: "restricted-command-marker", run: () => {} }]} />);
  expect(html).toContain("Verify your age to view this comment.");
  expect(html).not.toContain("restricted-");
});

test("public comments omit debug metadata when no timestamp exists", () => {
  const html = renderToString(() => <CommentCard item={{ id: "public", submissionId: null, parentId: null,
    body: "Public comment", authorLabel: "Public profile", depth: 2, replyCount: 3, state: "published", caseRef: null, href: null }} />);
  expect(html).toContain("Public profile");
  expect(html).not.toContain("Depth");
  expect(html).not.toContain("replies");
});

test("a post card without viewer controls renders counts without requesting sign-in", () => {
  const html = renderToString(() => <CommunityPostCard post={{ id: "unspecified-viewer", title: "Public post", body: "Public text", score: 3, commentCount: 2, publishedAt: "2026-10-05T08:00:00Z" }} />);
  expect(html).toContain("data-post-counts");
  expect(html).not.toContain('aria-label="Upvote"');
  expect(html).not.toContain('aria-label="Comments');
});

test("timestamps distinguish minutes from hours and omit invalid dates", () => {
  const now = Date.parse("2026-10-05T08:00:00Z");
  expect(relativeTime("2026-10-05T07:59:50Z", now)).toBe("Just now");
  expect(relativeTime("2026-10-05T07:55:00Z", now)).toBe("5m ago");
  expect(relativeTime("2026-10-05T07:00:00Z", now)).toBe("1h ago");
  expect(relativeTime("2026-10-04T08:00:00Z", now)).toBe("1d ago");
  expect(relativeTime("invalid", now)).toBeUndefined();
  expect(relativeTime(undefined, now)).toBeUndefined();
});
