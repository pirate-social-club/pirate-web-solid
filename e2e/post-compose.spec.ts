import { expect, hasE2eAuthCredentials, test } from "./fixtures/auth.ts";

// The composer a member actually opens: the community page's own Post
// action, not the global entry with a raw community identifier typed into it.
// The surface under test is the one that ships, so the assertions follow it —
// the body lives in the framed composer's Description field, and a successful
// publication closes the form rather than leaving a message inside it.

const allowMutation = process.env.E2E_ALLOW_MUTATION === "1";
const communityPath = process.env.E2E_COMMUNITY_PATH_SEGMENT?.trim()
  ?? process.env.E2E_ROUTE_AUTHORIZED_COMMUNITY_ID?.trim();

test.describe("post to a community from its own page", { tag: "@staging-mutating" }, () => {
  test.skip(!allowMutation, "Set E2E_ALLOW_MUTATION=1 to publish staging content");
  test.skip(!hasE2eAuthCredentials(), "Set E2E_PRIVY_EMAIL and E2E_PRIVY_OTP for staging authentication");
  test.skip(
    !communityPath,
    "Set E2E_COMMUNITY_PATH_SEGMENT to a staging community this account belongs to with an active persona",
  );

  test("publishes text, persists both vote directions, and reloads comments and replies", async ({ page }) => {
    const marker = `E2E text post ${Date.now()}`;
    await page.goto(`/c/${communityPath}`);
    await page.locator("#app-root[data-hydrated='true']").waitFor({ state: "attached" });

    const postHere = page.getByRole("button", { name: "Post" });
    await expect(postHere).toBeVisible();
    await postHere.click();

    const composer = page.getByRole("form", { name: "Create a post" });
    await expect(composer).toBeVisible();
    // The composer inherits the community and the persona from the page, so
    // neither is asked for here. A raw identifier field would be a regression.
    await expect(composer.getByRole("textbox", { name: "Community ID" })).toHaveCount(0);
    await composer.getByLabel("Title", { exact: true }).fill(marker);
    await composer.getByLabel("Description", { exact: true }).fill(marker);

    const published = page.waitForResponse(response =>
      response.request().method() === "POST"
      && /\/api\/communities\/[^/]+\/posts$/u.test(new URL(response.url()).pathname));
    await composer.getByRole("button", { name: "Publish post" }).click();
    expect((await published).status()).toBe(201);

    // Completing the operation closes it; a lingering form is a dead end.
    await expect(composer).toBeHidden();

    test.info().annotations.push({
      type: "cleanup-required",
      description: `No post-delete contract exists; staging content is identifiable by marker ${marker}`,
    });
    await page.reload();
    await expect(page.getByText(marker, { exact: true }).first()).toBeVisible();
    const card = page.locator("[data-community-post]").filter({has: page.getByText(marker,{exact:true})}).first();
    await card.scrollIntoViewIfNeeded();
    // Membership is a precondition: following alone cannot vote or comment.
    const upvote=card.getByRole("button",{name:"Upvote",exact:true});
    const downvote=card.getByRole("button",{name:"Downvote",exact:true});
    await expect(upvote).toBeVisible();
    await upvote.click();
    await expect(upvote).toHaveAttribute("aria-pressed","true");
    await page.reload();
    await expect(upvote).toHaveAttribute("aria-pressed","true");
    await downvote.click();
    await expect(downvote).toHaveAttribute("aria-pressed","true");
    await page.reload();
    await expect(downvote).toHaveAttribute("aria-pressed","true");
    await card.getByRole("button",{name:/^Comments/}).click();
    const comment=`${marker} comment`;
    await page.getByRole("textbox",{name:"Write a comment"}).fill(comment);
    await page.getByRole("button",{name:"Post comment",exact:true}).click();
    const commentCard=page.locator("[data-comment-id]").filter({has:page.getByText(comment,{exact:true})});
    await expect(commentCard).toHaveAttribute("data-comment-state","published");
    await page.reload();
    await card.getByRole("button",{name:/^Comments/}).click();
    await expect(commentCard).toBeVisible();
    await commentCard.getByRole("button",{name:"Reply",exact:true}).click();
    const reply=`${marker} reply`;
    await page.getByRole("textbox",{name:"Write a reply"}).fill(reply);
    await page.getByRole("button",{name:"Post reply",exact:true}).click();
    await expect(page.locator("[data-comment-id]").filter({has:page.getByText(reply,{exact:true})})).toHaveAttribute("data-comment-state","published");
    await page.reload();
    await card.getByRole("button",{name:/^Comments/}).click();
    await commentCard.getByRole("button",{name:"View replies",exact:true}).click();
    await expect(page.getByText(reply,{exact:true})).toBeVisible();

  });
});
