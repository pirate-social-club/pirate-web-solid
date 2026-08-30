/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { Show, createSignal } from "solid-js";

import {
  Button,
  IconBell,
  IconBroadcast,
  IconHouse,
  IconMagnifyingGlass,
  IconMicrophone,
  IconPlus,
  IconUsersThree,
  Type,
} from "../../../design-system";
import type { ActivePersonaPublicProjection } from "../../../api/session.ts";
import { SignInModal } from "../../auth/sign-in-modal.tsx";
import { createSignInSession } from "../../auth/sign-in-session.ts";
import { CreatePostDialog } from "../../posts/post-composer/create-post-dialog.tsx";
import { AppHeader, MobileFooterNav } from "../app-shell-chrome/app-shell-chrome";
import { AppSidebar, SidebarContent, type SidebarItem, type SidebarSection } from "../app-sidebar/app-sidebar";

export type MediaShellRoute =
  | "home"
  | "search"
  | "live"
  | "communities"
  | "karaoke"
  | "study"
  | "activity"
  | "settings";

export interface MediaShellProps {
  readonly children: JSX.Element;
  readonly activeItemId?: MediaShellRoute;
  readonly signedIn?: boolean;
  readonly principalId?: string;
  readonly personas?: readonly ActivePersonaPublicProjection[];
  readonly class?: string;
}

function routeFor(id: string): string | undefined {
  switch (id) {
    case "home": return "/";
    case "search": return "/search";
    case "live": return "/live";
    case "communities": return "/communities";
    case "activity": return "/activity";
    case "karaoke": return "/karaoke";
    case "study": return "/study";
    case "settings": return "/settings";
    default: return undefined;
  }
}

function navigate(id: string): void {
  const path = routeFor(id);
  if (path !== undefined && typeof window !== "undefined") window.location.assign(path);
}

function SidebarFooter(props: { readonly signedIn: () => boolean; readonly onSignIn: () => void }) {
  return <div class="flex flex-col gap-3">
    <div class="text-base font-semibold leading-6 text-white">{props.signedIn() ? "Your Pirate" : "Join Pirate"}</div>
    <div class="text-base font-normal leading-5 text-white/60">{props.signedIn() ? "Session active" : "Save, follow, and post"}</div>
    <Show when={props.signedIn()} fallback={<button type="button" onClick={props.onSignIn} class="block w-full rounded-lg bg-white px-3 py-2 text-center text-sm font-semibold text-black hover:bg-white/90">Sign in</button>}>
      <a href="/settings" class="block rounded-lg border border-white/20 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-white/10">Account settings</a>
    </Show>
  </div>;
}

/** Shared desktop-first media shell; route content remains owned by each feature. */
export function MediaShell(props: MediaShellProps) {
  const signedIn = () => props.signedIn === true;
  const activeItem = () => props.activeItemId ?? "home";
  const primaryItems: readonly SidebarItem[] = [
    { id: "home", label: "Home", icon: <IconHouse class="size-5" /> },
    { id: "search", label: "Search", icon: <IconMagnifyingGlass class="size-5" /> },
    { id: "live", label: "Live", icon: <IconBroadcast class="size-5" /> },
  ];
  const sections: readonly SidebarSection[] = [
    {
      id: "community",
      label: "Community",
      items: [
        { id: "communities", label: "Communities", icon: <IconUsersThree class="size-5" /> },
        { id: "activity", label: "Activity", icon: <IconBell class="size-5" /> },
      ],
    },
    {
      id: "create",
      label: "Create",
      items: [
        { id: "karaoke", label: "Karaoke", icon: <IconMicrophone class="size-5" /> },
      ],
    },
  ];
  const goHome = () => navigate("home");
  const [authOpen, setAuthOpen] = createSignal(false);
  const [composerOpen, setComposerOpen] = createSignal(false);
  const openAuth = () => setAuthOpen(true);
  const openComposer = () => {
    if (signedIn()) setComposerOpen(true);
    else openAuth();
  };
  const completeAuth = () => {
    setAuthOpen(false);
    navigate("home");
  };
  const signInSession = createSignInSession({ enabled: authOpen, onAuthenticated: completeAuth });

  return <div data-media-shell data-shell-auth={signedIn() ? "authenticated" : "anonymous"} class={`min-h-screen bg-background text-foreground ${props.class ?? ""}`}>
    <div class="flex min-h-screen">
      <AppSidebar
        activeItemId={activeItem()}
        appearance="media"
        brandLabel="PIRATE"
        class="sticky top-0 hidden h-screen md:flex"
        footer={<SidebarFooter onSignIn={openAuth} signedIn={() => signedIn()} />}
        homeAriaLabel="Go to Pirate home"
        onHomeClick={goHome}
        onNavigate={navigate}
        primaryItems={primaryItems}
        sections={sections}
        mediaAction={<Button class="w-full rounded-xl bg-white text-black hover:bg-white/90" onClick={openComposer}><IconPlus class="size-5" />Create post</Button>}
      />
      <SidebarContent class="min-h-screen bg-background pb-20 md:pb-0">
        <div class="md:hidden">
          <AppHeader
            forceMobile
            hideBrand
            mobileAppearance="media-overlay"
            mobileCenterContent={<Type as="span" variant="h4" class="text-white">PIRATE</Type>}
            mobileTrailingContent={signedIn() ? undefined : <button type="button" onClick={openAuth} class="px-2 text-sm font-semibold text-white">Sign in</button>}
            onHomeClick={goHome}
            showNotificationsAction={false}
            showProfileAction={false}
            showWalletAction={false}
          />
        </div>
        <div class="mx-auto min-h-screen w-full max-w-5xl px-4 py-5 md:px-8 md:py-8">{props.children}</div>
        <MobileFooterNav class="md:hidden" forceMobile activeItem="home" onHomeClick={goHome} />
      </SidebarContent>
    </div>
    <SignInModal open={authOpen()} onOpenChange={setAuthOpen} session={signInSession} />
    <Show when={props.principalId}>
      {(principalId) => <CreatePostDialog
        open={composerOpen()}
        onOpenChange={setComposerOpen}
        personas={props.personas ?? []}
        principalId={principalId()}
      />}
    </Show>
  </div>;
}
