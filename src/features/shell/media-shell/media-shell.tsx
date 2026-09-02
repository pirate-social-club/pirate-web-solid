/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import {
  Button,
  IconBell,
  IconBroadcast,
  IconHouse,
  IconButton,
  IconMagnifyingGlass,
  IconMicrophone,
  IconUsersThree,
  Type,
} from "../../../design-system";
import {
  preloadGlobalSignInAssets,
  prepareGlobalSignIn,
  requestGlobalSignIn,
} from "../../auth/global-sign-in-host.tsx";
import type { ApplicationChromeMode, ApplicationChromeRoute } from "../application-chrome-model.ts";
import { AppHeader, MobileFooterNav } from "../app-shell-chrome/app-shell-chrome";
import { AppSidebar, SidebarContent, type SidebarItem, type SidebarSection } from "../app-sidebar/app-sidebar";
import type { ShellNavItem } from "../shell-model.ts";

export type MediaShellRoute = ApplicationChromeRoute;

export interface MediaShellProps {
  readonly children: JSX.Element;
  readonly activeItemId?: MediaShellRoute;
  readonly mobileActiveItem?: ShellNavItem;
  readonly mobileTitle?: string;
  readonly mode?: ApplicationChromeMode;
  readonly navigate?: (href: string) => void;
  readonly signedIn?: boolean;
  /** Compatibility seam for existing stories; `mode="immersive"` is canonical. */
  readonly immersive?: boolean;
  readonly class?: string;
}

function routeFor(id: string): string | undefined {
  switch (id) {
    case "home": return "/";
    case "search": return "/search";
    case "live": return "/live";
    case "communities": return "/communities/new";
    case "activity": return "/activity";
    case "karaoke": return "/karaoke";
    case "study": return "/study";
    case "settings": return "/settings";
    default: return undefined;
  }
}

function navigate(id: string, navigateTo?: (href: string) => void): void {
  const path = routeFor(id);
  if (path === undefined) return;
  if (navigateTo) navigateTo(path);
  else if (typeof window !== "undefined") window.location.assign(path);
}

/** One application-chrome owner; route content retains only feature layout. */
export function ApplicationChrome(props: MediaShellProps) {
  const signedIn = () => props.signedIn === true;
  const activeItem = () => props.activeItemId ?? "home";
  const mode = () => props.mode ?? (props.immersive ? "immersive" : "standard");
  const immersive = () => mode() === "immersive";
  const navigateById = (id: string) => navigate(id, props.navigate);
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
        { id: "activity", label: "Activity", icon: <IconBell class="size-5" /> },
      ],
    },
    {
      id: "create",
      label: "Create",
      items: [
        { id: "communities", label: "Create community", icon: <IconUsersThree class="size-5" /> },
        { id: "karaoke", label: "Karaoke", icon: <IconMicrophone class="size-5" /> },
      ],
    },
  ];
  const goHome = () => navigateById("home");
  const goProfile = () => navigateById("settings");

  return <Show when={mode() !== "bare"} fallback={props.children}><div data-application-chrome data-media-shell data-shell-mode={mode()} data-shell-auth={signedIn() ? "authenticated" : "anonymous"} class={`min-h-screen bg-background text-foreground ${props.class ?? ""}`}>
    <div class="flex min-h-screen">
      <AppSidebar
        activeItemId={activeItem()}
        appearance="media"
        brandLabel="PIRATE"
        class="sticky top-0 hidden h-screen md:flex"
        footerActionHref={signedIn() ? "/settings" : undefined}
        footerActionLabel={signedIn() ? "Account settings" : "Sign in"}
        footerDetail={signedIn() ? "Session active" : "Save, follow, and post"}
        footerTitle={signedIn() ? "Your Pirate" : "Join Pirate"}
        homeAriaLabel="Go to Pirate home"
        onFooterAction={requestGlobalSignIn}
        onFooterActionFocus={prepareGlobalSignIn}
        onFooterActionPointerDown={prepareGlobalSignIn}
        onFooterActionPointerEnter={preloadGlobalSignInAssets}
        onHomeClick={goHome}
        onNavigate={navigateById}
        primaryItems={primaryItems}
        sections={sections}
      />
      <SidebarContent class={immersive() ? "h-[100dvh] overflow-hidden bg-black md:h-screen" : "min-h-[100dvh] bg-background pb-20 md:min-h-screen md:pb-0"}>
        <div class="md:hidden">
          <AppHeader
            forceMobile
            hideBrand
            mobileAppearance={immersive() ? "media-overlay" : "default"}
            mobileCenterContent={<Type as="span" variant="h4" class={immersive() ? "text-white" : undefined}>{props.mobileTitle ?? "PIRATE"}</Type>}
            mobileLeadingContent={
              <IconButton
                aria-label={immersive() ? "Create community" : "Go home"}
                class={immersive() ? "text-white hover:bg-white/10 focus-visible:ring-white" : undefined}
                onClick={immersive() ? () => navigateById("communities") : goHome}
                variant="ghost"
              >
                <Show when={immersive()} fallback={<IconHouse class="size-6" />}><IconUsersThree class="size-6" /></Show>
              </IconButton>
            }
            mobileTrailingContent={signedIn() ? undefined : <Button type="button" onClick={requestGlobalSignIn} onFocus={prepareGlobalSignIn} onPointerDown={prepareGlobalSignIn} onPointerEnter={preloadGlobalSignInAssets} class={immersive() ? "text-white" : undefined} size="sm" variant="ghost">Sign in</Button>}
            onHomeClick={goHome}
            onProfileClick={goProfile}
            showNotificationsAction={false}
            showProfileAction={signedIn()}
            showWalletAction={false}
          />
        </div>
        <div class={immersive() ? "h-[100dvh] w-full md:h-screen" : "min-h-[100dvh] w-full pt-[calc(env(safe-area-inset-top)+4rem)] md:min-h-screen md:pt-0"}>{props.children}</div>
        <MobileFooterNav class="md:hidden" forceMobile activeItem={props.mobileActiveItem ?? "home"} onHomeClick={goHome} onLearnClick={() => navigateById("study")} onProfileClick={goProfile} onWalletClick={() => navigateById("settings")} />
      </SidebarContent>
    </div>
  </div></Show>;
}

/** Story and compatibility export; production mounts `ApplicationChrome` once. */
export const MediaShell = ApplicationChrome;
