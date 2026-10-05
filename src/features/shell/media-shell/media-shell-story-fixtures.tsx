/** @jsxImportSource @solidjs/web */
import { createMemo, createSignal, omit } from "solid-js";
import { switcherPersonas } from "../../identity/persona-switcher-sheet/persona-switcher-fixtures.ts";
import { Type } from "../../../design-system";
import { CommunityPageShell } from "../../community/page-shell/page-shell.tsx";
import type { SwitchablePersona } from "../../identity/persona-switcher-sheet/persona-switcher-sheet.tsx";
import { resolveApplicationChrome } from "../application-chrome-model.ts";
import { profilePath, type ApplicationNavigationScope, type CommunityNavigationData } from "../navigation-model.ts";
import type { DrawerCommunity } from "../navigation-drawer.tsx";
import { MediaShell, type MediaShellProps } from "./media-shell";

const communities: readonly DrawerCommunity[] = [
  { communityId: "community_harbor", displayName: "Harbor Collective", href: "/c/harbor" },
  { communityId: "community_night", displayName: "Night Shift Radio", href: "/c/night-shift" },
];

// Review fixtures only; popularity order represents descending member count.
export const popularNavigation: CommunityNavigationData = {
  joined: [], moderated: [], popular: [
    { communityId: "community_sounds", displayName: "World of Sound", href: "/c/world-of-sound" },
    { communityId: "community_lofi", displayName: "Late Night Lo-Fi", href: "/c/late-night" },
    { communityId: "community_songwriters", displayName: "Songwriters Circle", href: "/c/songwriters" },
    ...communities,
  ],
};
export const memberNavigation: CommunityNavigationData = { ...popularNavigation, joined: communities };
export const creatorNavigation: CommunityNavigationData = {
  ...memberNavigation,
  moderated: [{ communityId: "community_harbor", displayName: "Harbor Collective", href: "/c/harbor" }],
};
export const manyJoinedNavigation: CommunityNavigationData = {
  ...memberNavigation,
  joined: [...communities, ...Array.from({ length: 6 }, (_, index) => ({ communityId: `joined_${index}`, displayName: `Music Collective ${index + 1}`, href: `/c/music-${index + 1}` }))],
};

// One profile is bound to a community; the drawer lists that community once.
export const personas: readonly SwitchablePersona[] = switcherPersonas.map(persona =>
  persona.personaId === "persona_night" ? { ...persona, communityId: "community_night" } : persona);

/** Stands in for the full-bleed home video so the transparent header reads as it does in the app. */
function VideoFeedPreview() {
  return (
    <main data-feed-preview class="grid h-full min-h-[100dvh] place-items-center bg-gradient-to-b from-slate-700 via-slate-900 to-black">
      <Type class="text-white/70">Video feed</Type>
    </main>
  );
}

function PagePreview(props: { title: string; path: string }) {
  return (
    <main class="mx-auto flex max-w-2xl flex-col gap-2 px-4 py-8">
      <Type as="h1" variant="h1">{props.title || "Page"}</Type>
      <Type class="text-muted-foreground">Placeholder for {props.path}</Type>
    </main>
  );
}

export function ShellStory(props: Partial<MediaShellProps> & { readonly initialPath?: string }) {
  const shellProps = omit(props, "initialPath");
  const profiles = () => props.personas ?? personas;
  const [selected, setSelected] = createSignal(profiles()[0]?.personaId);
  const [path, setPath] = createSignal(props.initialPath ?? "/");
  const policy = createMemo(() => {
    const persona = profiles().find(profile => profile.personaId === selected());
    return resolveApplicationChrome(path(), persona ? profilePath(persona) : undefined);
  });
  return (
    <MediaShell
      signedIn
      personas={profiles()}
      selectedPersonaId={selected()}
      onPersonaSelect={setSelected}
      communityNavigation={{ kind: "ready", data: memberNavigation }}
      currentPath={path()}
      navigate={setPath}
      activeItemId={policy().activeItemId}
      mobileActiveItem={policy().mobileActiveItem}
      mobileTitle={policy().mobileTitle}
      hideMobileHeader={policy().hideMobileHeader}
      mode={policy().mode}
      {...shellProps}
    >
      <Type class="sr-only" role="status">Destination: {path()}</Type>
      {path() === "/" ? <VideoFeedPreview /> : path() === "/c/harbor" ? (
        <CommunityPageShell
          community={{ id: "community_harbor", name: "Harbor Collective", handle: "c/harbor", description: "A place for songs and their stories.", members: 124, followers: 87, posts: [] }}
          feed={() => ({ kind: "ready", posts: [] })}
          following={false}
          joined={true}
          onBack={() => setPath("/communities")}
        />
       ) : <PagePreview path={path()} title={policy().mobileTitle} />}
    </MediaShell>
  );
}

export const reviewViewports = {
  mobile1: { name: "Phone", styles: { width: "390px", height: "844px" }, type: "mobile" },
  desktopReview: { name: "Desktop", styles: { width: "1280px", height: "900px" }, type: "desktop" },
} as const;

export const communityAppScope: ApplicationNavigationScope = {
  kind: "community",
  community: { communityId: "community_harbor", displayName: "Harbor Collective", href: "/c/harbor" },
};
export const communityModeratorScope: ApplicationNavigationScope = {
  ...communityAppScope, moderationHref: "/c/harbor/settings/moderation_queue",
};
