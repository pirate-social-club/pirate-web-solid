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
