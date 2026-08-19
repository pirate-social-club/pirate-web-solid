/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { Show, createSignal } from "solid-js";

import { Type } from "../../../design-system";
import { SignInDialog } from "../../auth/sign-in-dialog.tsx";
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
  readonly class?: string;
}

const primaryItems: readonly SidebarItem[] = [
  { id: "home", label: "Home" },
  { id: "search", label: "Search" },
  { id: "live", label: "Live" },
];

const sections: readonly SidebarSection[] = [
  {
    id: "community",
    label: "Community",
    items: [
      { id: "communities", label: "Communities" },
      { id: "activity", label: "Activity" },
    ],
  },
  {
    id: "create",
    label: "Create",
    items: [
      { id: "karaoke", label: "Karaoke" },
      { id: "study", label: "Study" },
    ],
  },
];

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

function SignInAction(props: { readonly signedIn: () => boolean; readonly onSignIn: () => void }) {
  return <Show when={props.signedIn()} fallback={
    <button type="button" onClick={props.onSignIn} class="block w-full rounded-lg bg-white px-3 py-2 text-center text-sm font-semibold text-black hover:bg-white/90">
      Sign in
    </button>
  }>
    <a href="/settings" class="block rounded-lg border border-white/20 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-white/10">
      Account settings
    </a>
  </Show>;
}

function SidebarFooter(props: { readonly signedIn: () => boolean; readonly onSignIn: () => void }) {
  return (
    <div class="flex flex-col gap-3">
      <div>
        <Type as="div" variant="body-strong" class="text-white">{props.signedIn() ? "Your Pirate" : "Join Pirate"}</Type>
        <Type as="div" variant="caption" class="text-white/60">{props.signedIn() ? "Session active" : "Save, follow, and post"}</Type>
      </div>
      <SignInAction onSignIn={props.onSignIn} signedIn={props.signedIn} />
    </div>
  );
}

/** Shared desktop-first media shell; route content remains owned by each feature. */
export function MediaShell(props: MediaShellProps) {
  const signedIn = () => props.signedIn === true;
  const activeItem = () => props.activeItemId ?? "home";
  const goHome = () => navigate("home");
  const [authOpen, setAuthOpen] = createSignal(false);
  const openAuth = () => setAuthOpen(true);
  const completeAuth = () => {
    setAuthOpen(false);
    navigate("home");
  };

  return (
    <div data-media-shell data-shell-auth={signedIn() ? "authenticated" : "anonymous"} class={`min-h-screen bg-background text-foreground ${props.class ?? ""}`}>
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
          <div class="mx-auto min-h-screen w-full max-w-5xl px-4 py-5 md:px-8 md:py-8">
            {props.children}
          </div>
          <MobileFooterNav class="md:hidden" forceMobile activeItem="home" onHomeClick={goHome} />
        </SidebarContent>
      </div>
      <SignInDialog open={authOpen()} onAuthenticated={completeAuth} onOpenChange={setAuthOpen} />
    </div>
  );
}
