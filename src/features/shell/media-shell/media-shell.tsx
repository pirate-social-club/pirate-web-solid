/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import {
  Button,
  IconHouse,
  IconButton,
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
  readonly mobileActiveItem?: ShellNavItem | "none";
  readonly mobileTitle?: string;
  readonly mode?: ApplicationChromeMode;
  readonly navigate?: (href: string) => void;
  readonly signedIn?: boolean;
  readonly sessionUnavailable?: boolean;
  readonly sessionResolving?: boolean;
  readonly sessionPending?: boolean;
  readonly onSessionRetry?: () => void;
  /** The viewer's own public profile; unset until the account personas land. */
  readonly profileHref?: string;
  /** Compatibility seam for existing stories; `mode="immersive"` is canonical. */
  readonly immersive?: boolean;
  readonly class?: string;
}

function routeFor(id: string): string | undefined {
  switch (id) {
    case "home": return "/";
    case "your-communities": return "/communities";
    case "create-community": return "/communities/new";
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
  ];
  const sections: readonly SidebarSection[] = [
    {
      id: "community",
      label: "Community",
      items: [
        { id: "your-communities", label: "Communities", icon: <IconUsersThree class="size-5" /> },
      ],
    },
    {
      id: "create",
      label: "Create",
      items: [
        { id: "create-community", label: "Create community", icon: <IconUsersThree class="size-5" /> },
      ],
    },
  ];
  const goHome = () => navigateById("home");
  const profileTarget = () => props.profileHref ?? "/communities";
  const anonymousSettled = () => !props.sessionResolving && !props.sessionUnavailable && !signedIn();
  const openProfile = () => {
    if (!signedIn()) {
      if (anonymousSettled()) requestGlobalSignIn();
      return;
    }
    if (props.navigate) props.navigate(profileTarget());
    else if (typeof window !== "undefined") window.location.assign(profileTarget());
  };

  return <Show when={mode() !== "bare"} fallback={props.children}><div data-application-chrome data-media-shell data-shell-mode={mode()} data-shell-auth={props.sessionResolving ? "resolving" : props.sessionUnavailable ? "unavailable" : signedIn() ? "authenticated" : "anonymous"} class={`min-h-screen bg-background text-foreground ${props.class ?? ""}`}>
    <div class="flex min-h-screen">
      <AppSidebar
        activeItemId={activeItem()}
        appearance="media"
        brandLabel="PIRATE"
        class="sticky top-0 hidden h-screen md:flex"
        footerActionHref={signedIn() ? profileTarget() : undefined}
        footerActionDisabled={props.sessionResolving || (props.sessionUnavailable && props.sessionPending)}
        footerActionLabel={props.sessionResolving || (props.sessionUnavailable && props.sessionPending) ? "Checking account" : props.sessionUnavailable ? "Retry account check" : signedIn() ? "Your profile" : "Sign in"}
        footerDetail={props.sessionResolving || (props.sessionUnavailable && props.sessionPending) ? "Checking your account" : props.sessionUnavailable ? "Your account could not be checked" : signedIn() ? "View your public profile" : "Save, follow, and post"}
        footerTitle={props.sessionResolving ? "Account" : props.sessionUnavailable ? "Connection unavailable" : signedIn() ? "Your Pirate" : "Join Pirate"}
        homeAriaLabel="Go to Pirate home"
        onFooterAction={props.sessionResolving ? undefined : props.sessionUnavailable ? props.onSessionRetry : requestGlobalSignIn}
        onFooterActionFocus={props.sessionResolving || props.sessionUnavailable ? undefined : prepareGlobalSignIn}
        onFooterActionPointerDown={props.sessionResolving || props.sessionUnavailable ? undefined : prepareGlobalSignIn}
        onFooterActionPointerEnter={props.sessionResolving || props.sessionUnavailable ? undefined : preloadGlobalSignInAssets}
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
                onClick={immersive() ? () => navigateById("create-community") : goHome}
                variant="ghost"
              >
                <Show when={immersive()} fallback={<IconHouse class="size-6" />}><IconUsersThree class="size-6" /></Show>
              </IconButton>
            }
            mobileTrailingContent={props.sessionResolving ? <Type as="span" variant="caption">Account</Type> : props.sessionUnavailable ? <Button type="button" onClick={props.onSessionRetry} disabled={props.sessionPending} size="sm" variant="ghost">{props.sessionPending ? "Checking account" : "Retry account check"}</Button> : signedIn() ? undefined : <Button type="button" onClick={requestGlobalSignIn} onFocus={prepareGlobalSignIn} onPointerDown={prepareGlobalSignIn} onPointerEnter={preloadGlobalSignInAssets} class={immersive() ? "text-white" : undefined} size="sm" variant="ghost">Sign in</Button>}
            onHomeClick={goHome}
            onProfileClick={openProfile}
            showNotificationsAction={false}
            showProfileAction={signedIn()}
            showWalletAction={false}
          />
        </div>
        <div class={immersive() ? "h-[100dvh] w-full md:h-screen" : "min-h-[100dvh] w-full pt-[calc(env(safe-area-inset-top)+4rem)] md:min-h-screen md:pt-0"}>{props.children}</div>
        <MobileFooterNav
          class="md:hidden"
          forceMobile
          activeItem={props.mobileActiveItem ?? "home"}
          labels={{
            communities: "Communities",
            communitiesAriaLabel: "Communities",
            profile: signedIn() ? "Profile" : anonymousSettled() ? "Sign in" : "Profile",
            profileAriaLabel: signedIn() ? "Your profile" : anonymousSettled() ? "Sign in" : "Profile",
          }}
          onCommunitiesClick={() => navigateById("your-communities")}
          onHomeClick={goHome}
          onProfileClick={openProfile}
        />
      </SidebarContent>
    </div>
  </div></Show>;
}

/** Story and compatibility export; production mounts `ApplicationChrome` once. */
export const MediaShell = ApplicationChrome;
