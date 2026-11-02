import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, waitFor, within } from "storybook/test";
import type { SessionResolution } from "../../../api/session";
import { MediaShell } from "../../shell/media-shell/media-shell";
import { resolveApplicationChrome } from "../../shell/application-chrome-model";
import { PublicPostRouteView } from "./public-post-route-view";
import { postStoryNetworkGuard, postSongStoryDependencies, postStoryState } from "./public-post-story-fixtures";
import { createMemoryPendingEngagementStorage } from "../post-engagement/post-engagement-pending";

type Props = { path: string; viewer: "anonymous" | "member" | "not_member"; community: boolean };
function PostWithShell(props: Props) {
  const state = postStoryState(true);
  if (state.kind !== "content") throw new Error("Expected content fixture");
  const communityId = state.response.content.post.community;
  const resolveSession = async (): Promise<SessionResolution> => props.viewer === "anonymous" ? "anonymous" : ({
    status: "authenticated", userId: "story-account", personas: props.viewer === "member" ? [{
      personaId: "story-profile", displayName: "Community member", avatarRef: null, primaryPublicHandle: null,
      communityBinding: { communityId, bindingSource: "first_membership" },
    }] : [],
  });
  const response = { ...state.response, content: { ...state.response.content,
    post: { ...state.response.content.post, post_type: "song" as const, title: "Harbor Lights", song_title: "Harbor Lights" },
    ...(props.community ? { community: {
      id: communityId, object: "community_preview" as const, display_name: "Harbor Collective", route_slug: "harbor-collective",
      avatar_ref: null, membership_mode: "open" as const, human_verification_lane: null,
      moderators: [], membership_gate_summaries: [], rules: [], created: 1_790_000_000,
      ...(props.viewer === "anonymous" ? {} : { viewer_membership_status: props.viewer }),
    } } : {}),
  } };
  const policy = resolveApplicationChrome(props.path);
  return <MediaShell
    currentPath={props.path} signedIn={props.viewer !== "anonymous"}
    personas={[]} communityNavigation={{ kind: "ready", data: { joined: [], moderated: [], popular: [] } }}
    activeItemId={policy.activeItemId} mobileActiveItem={policy.mobileActiveItem} mode={policy.mode}
    hideMobileHeader={policy.hideMobileHeader} hideMobileFooter={policy.hideMobileFooter}
  >
    <PublicPostRouteView state={{ ...state, response }} song={postSongStoryDependencies(resolveSession)} engagement={{
      resolveSession, readViewerVote: async () => null,
      readComments: async () => ({ items: [], next_cursor: null }), pendingStorage: createMemoryPendingEngagementStorage(),
    }} />
  </MediaShell>;
}

const network = postStoryNetworkGuard();
const meta = {
  beforeEach: network.beforeEach,
  afterEach: () => { expect(network.requests()).toEqual([]); },
  title: "Screens/Posts/PublicPostWithShell", component: PostWithShell,
  args: { path: "/posts/a-searchable-title", viewer: "anonymous", community: true },
  parameters: { layout: "fullscreen", a11y: { test: "error" }, viewport: { options: {
    postPhone: { name: "Phone", styles: { width: "390px", height: "844px" }, type: "mobile" },
    postDesktop: { name: "Desktop", styles: { width: "1440px", height: "1000px" }, type: "desktop" },
  } } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("No active streaks yet.")).toBeVisible();
    await expect(canvas.queryByText(/Couldn't check your session/)).toBeNull();
    await expect(canvas.queryByText("Presenting profile is unavailable.")).toBeNull();
    await expect(canvas.queryByText("No qualification requirements returned.")).toBeNull();
    await expect(canvas.getByRole("heading", { name: "Harbor Lights" })).toBeInTheDocument();
    await waitFor(() => expect(canvasElement.querySelector("nav[aria-label='Primary navigation']")).not.toBeVisible());
    const main = canvasElement.querySelector<HTMLElement>("[data-public-post-state='content']")!;
    await expect(main.scrollWidth).toBeLessThanOrEqual(main.clientWidth);
    if (args.community) await expect(canvasElement.querySelector("[data-post-page-header]")).toHaveTextContent("Harbor Collective");
    if (args.viewer === "anonymous") await expect(canvas.getByRole("button", { name: "Sign in to comment" })).toBeVisible();
    else if (args.viewer === "not_member" && args.community) await expect(canvas.getByRole("link", { name: "Join to comment" })).toHaveAttribute("href", "/c/harbor-collective");
    else await expect(canvas.getByRole("textbox", { name: "Write a comment" })).toBeVisible();
  },
} satisfies Meta<typeof PostWithShell>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PhoneAnonymous: Story = { globals: { viewport: { value: "postPhone", isRotated: false } } };
export const DesktopAnonymous: Story = { globals: { viewport: { value: "postDesktop", isRotated: false } } };
export const PhoneMember: Story = { args: { viewer: "member" }, globals: { viewport: { value: "postPhone", isRotated: false } } };
export const PhoneMemberById: Story = { args: { viewer: "member", path: "/post/post-1" }, globals: { viewport: { value: "postPhone", isRotated: false } } };
export const DesktopMemberById: Story = { args: { viewer: "member", path: "/post/post-1" }, globals: { viewport: { value: "postDesktop", isRotated: false } } };
export const PhoneNonMember: Story = { args: { viewer: "not_member" }, globals: { viewport: { value: "postPhone", isRotated: false } } };
export const DesktopNonMember: Story = { args: { viewer: "not_member" }, globals: { viewport: { value: "postDesktop", isRotated: false } } };
/** The audited production shape remains explicit instead of silently enriching every fixture. */
export const MissingCommunity: Story = { args: { community: false }, globals: { viewport: { value: "postDesktop", isRotated: false } } };
