import { UiLocaleProvider } from "../../../lib/ui-locale.tsx";
import { publicProfileFragment } from "../../identity/public-profile-label.ts";
import { CommunityPostCard } from "../../community/page-shell/page-shell.tsx";
import { compactRelativeTime, relativeTime } from "./relative-time.ts";
import { renderToString } from "@solidjs/web";
import { expect, test } from "vitest";
import { CommentCard } from "./comment-card.tsx";

// A caller may retain stale fields while an age decision changes. The shared
// card must not put those fields into public HTML, even without a controller.
test("age-locked comments redact retained content and identity in SSR", () => {
  const html = renderToString(() => <CommentCard item={{ id: "locked", submissionId: null, parentId: null,
    body: "restricted-content-marker", authorLabel: "restricted-identity-marker", authorPersonaId: "restricted-profile-marker", authorAvatarRef: "/restricted-avatar-marker", createdAt: "2026-10-05T08:00:00Z",
    depth: 0, replyCount: 0, state: "age_locked", caseRef: null, href: null }}
    communityLabel="restricted-community-marker" postContext={{ title: "restricted-title-marker", href: "/restricted-target-marker" }}
    menuActions={[{ label: "restricted-command-marker", run: () => {} }]} />);
  expect(html).toContain("Verify your age to view this comment.");
  expect(html).not.toContain("restricted-");
});

test("matching display labels retain different complete profile targets in posts and comments", () => {
  const label = "User 012345";
  const post = renderToString(() => <CommunityPostCard post={{ id: "post-one", title: "Earlier post", body: "Text",
    authorHandle: label, authorPersonaId: "community-profile-one", score: 0, publishedAt: "2026-10-09T00:00:00Z" }} />);
  const comment = renderToString(() => <CommentCard item={{ id: "comment-two", submissionId: null, parentId: null,
    body: "Earlier comment", authorLabel: label, authorPersonaId: "community-profile-two", depth: 0, replyCount: 0,
    state: "published", caseRef: null, href: null }} />);
  expect(post).toContain(label);
  expect(comment).toContain(label);
  expect(post).toContain('href="/p/community-profile-one"');
  expect(comment).toContain('href="/p/community-profile-two"');
  expect(post).not.toContain('href="https://User');
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

test("post cards use the compact age without a separator or 'ago'", () => {
  const now = Date.parse("2026-10-05T08:00:00Z");
  expect(compactRelativeTime("2026-10-05T07:59:50Z", now)).toBe("now");
  expect(compactRelativeTime("2026-10-05T07:55:00Z", now)).toBe("5m");
  expect(compactRelativeTime("2026-10-05T06:00:00Z", now)).toBe("2h");
  expect(compactRelativeTime("2026-10-04T08:00:00Z", now)).toBe("1d");
  expect(compactRelativeTime("invalid", now)).toBeUndefined();
  expect(compactRelativeTime(undefined, now)).toBeUndefined();
  const html = renderToString(() => <CommunityPostCard post={{ id: "aged", title: "Aged post", body: "Text", score: 0, publishedAt: "2026-10-05T08:00:00Z" }} />);
  expect(html).toContain('datetime="2026-10-05T08:00:00Z"');
  expect(html).not.toContain("·");
  expect(html).not.toContain(" ago");
});

test.each(["ar", "zh"] as const)("public post and comment labels use the %s page locale in SSR", locale => {
  const profile = { persona_id: "public-community-profile", primary_public_handle: null, display_name: null };
  const html = renderToString(() => <UiLocaleProvider locale={locale}>
    <CommunityPostCard post={{ id: "post", title: "Earlier post", body: "Text", authorHandle: "User stale-english",
      authorProfile: profile, authorPersonaId: profile.persona_id, score: 0, publishedAt: "2026-10-09T00:00:00Z" }} titleHref="/posts/earlier-post" />
    <CommentCard item={{ id: "comment", submissionId: null, parentId: null, body: "Earlier comment",
      authorLabel: "User stale-english", authorProfile: profile, authorPersonaId: profile.persona_id,
      depth: 0, replyCount: 0, state: "published", caseRef: null, href: null }} />
  </UiLocaleProvider>);
  expect(html).toContain(`${locale === "ar" ? "مستخدم" : "用户"} ${publicProfileFragment(profile.persona_id)}`);
  expect(html).not.toContain("User stale-english");
  expect(html).toContain('href="/p/public-community-profile"');
  expect(html).toContain('href="/posts/earlier-post"');
  expect(html).toContain('relative z-10 hover:underline');
});
