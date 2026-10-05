import { createSignal, Show } from "solid-js";
import { ApplicationPersonasContext, type ApplicationPersonas } from "../shell/application-personas.tsx";
import { ApplicationSessionProvider } from "../shell/application-session.tsx";
import { AccountPage } from "../shell/account-page.tsx";
import { CommunityPostCard } from "../community/page-shell/page-shell.tsx";
import { CommentContent } from "./profile-page/profile-comment-preview.tsx";
import { Type } from "../../design-system.ts";
import { ProfileLayout } from "./profile-page/profile-layout.tsx";
import PublicProfilePage from "./public-profile-page/public-profile-page.tsx";
import { ProfilePage } from "./profile-page/profile-page.tsx";

function FixturePost() {
  return <CommunityPostCard post={{ id: "profile-post", title: "Harbor Lights", body: "A new song for our next listening session.", kind: "text", score: 3, commentCount: 2, authorHandle: "owned.pirate", publishedAt: "2026-10-05T08:00:00Z" }} />;
}
function FixtureComment() {
  return <article class="border-b border-border-soft py-4"><CommentContent authorLabel="owned.pirate" metadata="Night Shift · 2 replies" body="The chorus is a good place to start practising." /><Type as="h2" variant="h4" class="mt-3">On Open Water</Type></article>;
}

/** Explicit preview activity: neither route supplies profile posts or comments yet. */
export function ProfileSettingsReview(props: { visitor?: boolean; live?: boolean } = {}) {
  const [settings, setSettings] = createSignal(false);
  const profile = { personaId: "owned", displayName: "Owned profile", publicHandle: "owned.pirate" };
  const profiles: ApplicationPersonas = {
    personas: () => props.visitor ? [] : [profile], selected: () => props.visitor ? undefined : profile,
    loading: () => false, unavailable: () => false, pickerOpen: () => false,
    setPickerOpen: () => {}, select: () => {}, retry: () => {},
  };
  return <ApplicationSessionProvider state={() => props.visitor ? "anonymous" : { status: "authenticated", userId: "viewer" }}><ApplicationPersonasContext value={profiles}>
    <div onClick={event => {
      const target = event.target;
      if (target instanceof Element && target.closest('a[href="/settings"]')) { event.preventDefault(); setSettings(true); }
    }}>
      <Show when={settings()} fallback={<Show when={props.live} fallback={<main class="pb-12"><ProfileLayout name="Owned profile" handle="owned.pirate"
        coverRef="/storybook/karaoke-artwork.svg" avatarRef="/storybook/karaoke-artwork.svg"
        bio="Songs, community sessions and late-night listening.">
        <ProfilePage renderOverview={() => <><FixturePost /><FixtureComment /></>} renderPosts={FixturePost} renderComments={FixtureComment} />
      </ProfileLayout></main>}><PublicProfilePage handle="owned.pirate" data={{ kind: "success", status: 200, requestedHandle: "owned.pirate", canonicalHandle: "owned.pirate", canonicalPath: "/u/owned.pirate", isCanonical: true, profile: { displayName: "Owned profile", handle: "owned.pirate", bio: "Songs, community sessions and late-night listening.", avatarRef: "/storybook/karaoke-artwork.svg", coverRef: "/storybook/karaoke-artwork.svg" }, communities: [{ name: "Harbor Collective", href: "/c/harbor" }, { name: "Night Shift", href: "/c/night-shift" }] }} /></Show>}><AccountPage navigate={() => setSettings(false)} /></Show>
    </div>
  </ApplicationPersonasContext></ApplicationSessionProvider>;
}
