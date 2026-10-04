/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { Show, createEffect, createSignal, onCleanup } from "solid-js";

import {
  Avatar,
  Button,
  IconButton,
  IconGlobe,
  IconHouse,
  IconList,
  IconPlaylist,
  IconWallet,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Type,
  createMediaQuery,
} from "../../../design-system";
import {
  preloadGlobalSignInAssets,
  prepareGlobalSignIn,
  requestGlobalSignIn,
} from "../../auth/global-sign-in-host.tsx";
import { useActivePersonaStoreOptional } from "../../identity/active-persona-store.tsx";
import { PersonaSwitcherSheet, type SwitchablePersona } from "../../identity/persona-switcher-sheet/persona-switcher-sheet.tsx";
import type { ApplicationChromeMode, ApplicationChromeRoute } from "../application-chrome-model.ts";
import { AppHeader, MobileFooterNav } from "../app-shell-chrome/app-shell-chrome";
import { AppSidebar, SidebarContent, type SidebarItem } from "../app-sidebar/app-sidebar";
import { navigationPath, profilePath, profileSwitch, primaryNavigation, primaryNavigationLabel, type CommunityNavigationState, type CommunityNavigationData } from "../navigation-model.ts";
import { loadDrawerCommunities, NavigationDrawer, type DrawerCommunity } from "../navigation-drawer.tsx";
import { CommunityNavigation } from "../community-navigation.tsx";
import type { ShellNavItem } from "../shell-model.ts";

export type MediaShellRoute = ApplicationChromeRoute;

export interface MediaShellProps {
  readonly children: JSX.Element;
  readonly activeItemId?: MediaShellRoute;
  readonly currentPath?: string;
  /** Reviewed navigation data; public discovery and created-by-me API binding follows. */
  readonly communityNavigation?: CommunityNavigationState;
  readonly loadCommunityNavigation?: (signedIn: boolean) => Promise<CommunityNavigationData>;
  readonly mobileActiveItem?: ShellNavItem | "none";
  readonly mobileTitle?: string;
  readonly hideMobileHeader?: boolean;
  readonly mode?: ApplicationChromeMode;
  readonly navigate?: (href: string) => void;
  readonly signedIn?: boolean;
  /** The account's profiles; selection is private navigation context only. */
  readonly personas?: readonly SwitchablePersona[];
  readonly selectedPersonaId?: string;
  readonly personasLoading?: boolean;
  readonly personasUnavailable?: boolean;
  readonly onPersonasRetry?: () => void;
  readonly onPersonaSelect?: (personaId: string) => void;
  readonly pickerOpen?: boolean;
  readonly onPickerOpenChange?: (open: boolean) => void;
  readonly initialMenuOpen?: boolean;
  readonly sessionUnavailable?: boolean;
  readonly sessionResolving?: boolean;
  readonly sessionPending?: boolean;
  readonly onSessionRetry?: () => void;
  /** Existing membership loader; discovery and ownership use the expanded loader. */
  readonly loadCommunities?: () => Promise<readonly DrawerCommunity[]>;
  /** Compatibility seam for existing stories; `mode="immersive"` is canonical. */
  readonly immersive?: boolean;
  readonly class?: string;
}

/** One application-chrome owner; route content retains only feature layout. */
export function ApplicationChrome(props: MediaShellProps) {
  let menuTrigger: HTMLButtonElement | undefined;
  let pendingNavigation: string | undefined;
  const signedIn = () => props.signedIn === true;
  const activeItem = () => props.activeItemId ?? "home";
  const mode = () => props.mode ?? (props.immersive ? "immersive" : "standard");
  const immersive = () => mode() === "immersive";
  const desktop = createMediaQuery("(min-width: 768px)");
  const [menuOpen, setMenuOpen] = createSignal(props.initialMenuOpen ?? false);
  const [localPickerOpen, setLocalPickerOpen] = createSignal(false);
  const pickerOpen = () => props.pickerOpen ?? localPickerOpen();
  const setPickerOpen = (open: boolean) => { setLocalPickerOpen(open); props.onPickerOpenChange?.(open); };
  const selected = () => props.personas?.find(persona => persona.personaId === props.selectedPersonaId);
  const navigateTo = (href: string) => {
    if (props.navigate) props.navigate(href);
    else if (typeof window !== "undefined") window.location.assign(href);
  };
  const go = (href: string) => {
    if (pickerOpen()) {
      pendingNavigation = href;
      setPickerOpen(false);
      return;
    }
    if (menuOpen()) {
      pendingNavigation = href;
      setMenuOpen(false);
      return;
    }
    navigateTo(href);
  };
  const afterMenuClose = (event: Event) => {
    event.preventDefault();
    if (!pickerOpen()) menuTrigger?.focus({ preventScroll: true });
    const href = pendingNavigation;
    pendingNavigation = undefined;
    // Release the modal layer before the router mounts another route tree.
    if (href) requestAnimationFrame(() => navigateTo(href));
  };
  const afterPickerClose = () => {
    const href = pendingNavigation;
    pendingNavigation = undefined;
    if (href) requestAnimationFrame(() => navigateTo(href));
  };
  const accountPending = () => props.sessionResolving === true || props.sessionUnavailable === true;
  /** The profile sheet: switching on desktop, and account recovery while the session check fails. */
  const openProfilePicker = () => {
    setMenuOpen(false);
    if (signedIn() || accountPending()) setPickerOpen(true);
    else requestGlobalSignIn();
  };
  /** A single tap on Profile opens the selected profile's page. */
  const openOwnProfile = () => {
    if (!signedIn()) {
      if (accountPending()) openProfilePicker();
      else requestGlobalSignIn();
      return;
    }
    const persona = selected();
    if (persona === undefined) openProfilePicker();
    else go(profilePath(persona));
  };
  const navigateById = (id: string) => {
    if (id === "profile") { openOwnProfile(); return; }
    const href = navigationPath(id);
    if (href) go(href);
  };

  // The community "post as" switcher belongs to the composer's active-persona
  // store. It stays a double-tap shortcut on the profile tab, separate from
  // the account profile picker above.
  const personaStore = useActivePersonaStoreOptional();
  const switchTarget = () => personaStore?.target();
  const switchable = () => (switchTarget()?.personas.length ?? 0) > 1;
  const selectedSwitchPersonaId = () => {
    const target = switchTarget();
    return target === undefined ? "" : personaStore?.activePersonaId(target.communityId) ?? "";
  };
  const [switchAnnouncement, setSwitchAnnouncement] = createSignal("");
  /**
   * A double tap on Profile switches profile. On a community page it acts on
   * that community's eligible profiles (the composer's active persona);
   * elsewhere on the account's profiles. Two toggle directly; three or more
   * open the sheet.
   */
  const doubleTapSwitch = () => {
    const target = switchTarget();
    // A registered community target owns the gesture, even with a single
    // eligible profile: it never falls back to switching account profiles.
    if (personaStore !== undefined && target !== undefined) {
      if (!switchable()) return;
      const next = profileSwitch(target.personas.map(persona => persona.personaId), selectedSwitchPersonaId() || undefined);
      if (next.kind === "open") personaStore.openSwitcher();
      if (next.kind === "toggle") {
        personaStore.selectPersona(target.communityId, next.personaId);
        const name = target.personas.find(persona => persona.personaId === next.personaId)?.displayName;
        if (name) setSwitchAnnouncement(`Now posting here as ${name}`);
      }
      return;
    }
    const personas = props.personas ?? [];
    const next = profileSwitch(personas.map(persona => persona.personaId), props.selectedPersonaId);
    if (next.kind === "open") setPickerOpen(true);
    if (next.kind === "toggle") {
      props.onPersonaSelect?.(next.personaId);
      const name = personas.find(persona => persona.personaId === next.personaId)?.displayName;
      if (name) setSwitchAnnouncement(`Now using ${name}`);
    }
  };
  const canSwitchProfile = () => {
    if (!signedIn()) return false;
    if (personaStore !== undefined && switchTarget() !== undefined) return switchable();
    return (props.personas?.length ?? 0) > 1;
  };

  const [communities, setCommunities] = createSignal<CommunityNavigationState>({ kind: "loading" });
  let communityRequest = 0;
  const loadCommunities = () => {
    const request = ++communityRequest;
    setCommunities({ kind: "loading" });
    // No fabricated public discovery or ownership projection: until the new
    // API reads land, the existing loader supplies memberships only.
    const loading = props.loadCommunityNavigation
      ? props.loadCommunityNavigation(signedIn())
      : signedIn()
        ? (props.loadCommunities ?? loadDrawerCommunities)().then(joined => ({ joined, popular: [], created: [] }))
        : Promise.reject(new Error("community_discovery_unavailable"));
    void loading
      .then(data => { if (request === communityRequest) setCommunities({ kind: "ready", data }); })
      .catch(() => { if (request === communityRequest) setCommunities({ kind: "error" }); });
  };
  onCleanup(() => { communityRequest++; });
  createEffect(() => [signedIn(), props.sessionResolving, props.communityNavigation] as const, ([, resolving, supplied]) => {
    const request = ++communityRequest;
    queueMicrotask(() => {
      if (request !== communityRequest || supplied) return;
      if (resolving) { setCommunities({ kind: "loading" }); return; }
      loadCommunities();
    });
  });
  const navigationState = () => props.communityNavigation ?? communities();

  createEffect(() => props.activeItemId, (_, previous) => { if (previous !== undefined) setMenuOpen(false); });
  createEffect(desktop, (wide, previous) => { if (wide && previous === false) setMenuOpen(false); });
  const primaryItems = (): readonly SidebarItem[] => primaryNavigation.map(item => ({
    ...item,
    href: item.id === "profile" && selected() ? profilePath(selected()!) : item.href,
    icon: item.id === "profile"
      ? <Avatar class="size-5" fallback={selected()?.displayName ?? "Profile"} fallbackSeed={selected()?.avatarSeed ?? selected()?.displayName} size="sm" src={selected()?.avatarSrc ?? undefined} />
      : item.id === "home" ? <IconHouse class="size-5" />
      : item.id === "explore" ? <IconGlobe class="size-5" />
      : item.id === "songs" ? <IconPlaylist class="size-5" />
      : <IconWallet class="size-5" />,
  }));
  const profileLabel = () => selected() ? `Switch profile, currently ${selected()!.displayName}` : "Profile";
  const profileControl = () => <button aria-label={profileLabel()} aria-haspopup="dialog" onClick={openProfilePicker} type="button" class="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-start hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <Avatar fallback={selected()?.displayName ?? "Profile"} fallbackSeed={selected()?.avatarSeed ?? selected()?.displayName} src={selected()?.avatarSrc ?? undefined} size="sm" />
    <span class="min-w-0 flex-1"><Type as="span" variant="body-strong" class="block truncate">{selected()?.displayName ?? "Profile"}</Type><Show when={selected()?.publicHandle}><Type as="span" variant="caption" class="block truncate">{selected()?.publicHandle}</Type></Show></span>
  </button>;
  const accountAction = () => <Show when={signedIn() || props.sessionResolving || props.sessionUnavailable} fallback={<Button class="w-full" onClick={requestGlobalSignIn} onFocus={prepareGlobalSignIn} onPointerDown={prepareGlobalSignIn} onPointerEnter={preloadGlobalSignInAssets}>Sign in</Button>}>{profileControl()}</Show>;
  /** Desktop only: the phone has footer tabs and the communities drawer. */
  function NavigationSidebar() {
    // Create one set per render: repeated prop reads must not recreate JSX
    // during SSR/hydration.
    const items = primaryItems();
    const footer = <div class="flex flex-col gap-3">{accountAction()}<div class="flex gap-4 px-3 text-xs"><a href="/terms">Terms</a><a href="/privacy">Privacy</a></div></div>;
    return <AppSidebar activeItemId={activeItem()} class="sticky top-0 hidden h-dvh md:flex" footer={footer} homeAriaLabel="Go home" onHomeClick={() => go("/")} onNavigate={navigateById} primaryItems={items} communityContent={<CommunityNavigation state={navigationState()} currentPath={props.currentPath} onNavigate={go} onRetry={loadCommunities} />} />;
  }

  return <Show when={mode() !== "bare"} fallback={props.children}><div data-application-chrome data-media-shell data-shell-mode={mode()} data-shell-auth={props.sessionResolving ? "resolving" : props.sessionUnavailable ? "unavailable" : signedIn() ? "authenticated" : "anonymous"} class={`min-h-screen bg-background text-foreground ${props.class ?? ""}`}>
    <div class="flex min-h-screen">
      <NavigationSidebar />
      <Sheet open={menuOpen()} onOpenChange={setMenuOpen}>
        <SheetContent side="left" onCloseAutoFocus={afterMenuClose} class="flex h-dvh w-80 max-w-[85vw] flex-col gap-0 bg-sidebar p-0 text-sidebar-foreground md:hidden" aria-label="Navigation">
          <SheetHeader class="sr-only"><SheetTitle>Navigation</SheetTitle></SheetHeader>
          <NavigationDrawer state={navigationState()} currentPath={props.currentPath} onNavigate={go} onRetry={loadCommunities} />
        </SheetContent>
      </Sheet>
      <SidebarContent class={immersive() ? "h-[100dvh] overflow-hidden bg-black md:h-screen" : "min-h-[100dvh] bg-background pb-20 md:min-h-screen md:pb-0"}>
        <Show when={!props.hideMobileHeader}>
        <div class="md:hidden">
          <AppHeader forceMobile hideBrand mobileAppearance={immersive() ? "media-overlay" : "default"}
            mobileCenterContent={<Show when={props.mobileTitle}>{title => <Type as="span" variant="h4" class={immersive() ? "text-white" : undefined}>{title()}</Type>}</Show>}
            mobileLeadingContent={<IconButton ref={(element: HTMLButtonElement) => { menuTrigger = element; }} aria-label="Open navigation" aria-expanded={menuOpen() ? "true" : "false"} aria-haspopup="dialog" onClick={() => setMenuOpen(true)} variant="ghost" class={immersive() ? "text-white hover:bg-white/10" : undefined}><IconList class="size-6" /></IconButton>}
            mobileTrailingContent={
              <div class="flex items-center gap-1">
                <Show when={immersive()}>
                  <Button aria-label="Choose a community to post in" onClick={() => go("/communities")} class="text-white" size="sm" variant="ghost">Post</Button>
                </Show>
                <Show when={!signedIn() && !props.sessionResolving && !props.sessionUnavailable}>
                  <Button onClick={requestGlobalSignIn} onFocus={prepareGlobalSignIn} onPointerDown={prepareGlobalSignIn} onPointerEnter={preloadGlobalSignInAssets} class={immersive() ? "text-white" : undefined} size="sm" variant="ghost">Sign in</Button>
                </Show>
              </div>
            }
            showNotificationsAction={false} showProfileAction={false} showWalletAction={false}
          />
        </div>
        </Show>
        <div class={immersive() ? "h-[100dvh] w-full md:h-screen" : props.hideMobileHeader ? "min-h-[100dvh] w-full md:min-h-screen" : "min-h-[100dvh] w-full pt-[calc(env(safe-area-inset-top)+4rem)] md:min-h-screen md:pt-0"}>{props.children}</div>
        <MobileFooterNav
          class="md:hidden"
          forceMobile
          activeItem={props.mobileActiveItem ?? "home"}
          avatarFallback={selected()?.displayName ?? "Profile"}
          labels={{
            home: primaryNavigationLabel("home"),
            songs: primaryNavigationLabel("songs"),
            wallet: primaryNavigationLabel("wallet"),
            profile: primaryNavigationLabel("profile"),
            // Matches what a tap does: the selected profile's page, the profile
            // sheet while the account check is pending or failed, or sign-in.
            profileAriaLabel: selected() ? `Profile, ${selected()!.displayName}` : signedIn() || accountPending() ? "Your profiles" : "Sign in",
          }}
          onHomeClick={() => go("/")}
          onSongsClick={() => go("/songs")}
          onWalletClick={() => go("/wallet")}
          onProfileClick={openOwnProfile}
          onProfileDoubleTap={canSwitchProfile() ? doubleTapSwitch : undefined}
          userAvatarSeed={selected()?.avatarSeed ?? selected()?.publicHandle ?? undefined}
          userAvatarSrc={selected()?.avatarSrc ?? undefined}
        />
        <Show when={personaStore === undefined ? undefined : switchTarget()}>
          {(target) => (
            <PersonaSwitcherSheet
              onOpenChange={(open) => { if (!open) personaStore!.closeSwitcher(); }}
              onSelect={(personaId) => {
                personaStore!.selectPersona(target().communityId, personaId);
                personaStore!.closeSwitcher();
              }}
              open={personaStore!.open()}
              personas={target().personas}
              selectedPersonaId={selectedSwitchPersonaId()}
              title={target().title ?? "Profile in this community"}
            />
          )}
        </Show>
        <span aria-live="polite" class="sr-only">{switchAnnouncement()}</span>
      </SidebarContent>
    </div>
    <PersonaSwitcherSheet title="Your profiles" onAfterClose={afterPickerClose} open={pickerOpen()} onOpenChange={setPickerOpen} personas={props.personas ?? []} selectedPersonaId={props.selectedPersonaId ?? ""} onSelect={id => { props.onPersonaSelect?.(id); setPickerOpen(false); }} loading={props.sessionResolving || props.personasLoading || (props.sessionUnavailable && props.sessionPending)} unavailable={props.sessionUnavailable || props.personasUnavailable} onRetry={props.sessionUnavailable ? props.onSessionRetry : props.onPersonasRetry} />
  </div></Show>;
}

/** Story and compatibility export; production mounts `ApplicationChrome` once. */
export const MediaShell = ApplicationChrome;
