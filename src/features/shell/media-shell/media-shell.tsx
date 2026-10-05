/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";

import {
  Button,
  IconButton,
  IconList,
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
import { CommunityPersonaControl } from "../../identity/community-persona-control.tsx";
import { PersonaSwitcherSheet, type SwitchablePersona } from "../../identity/persona-switcher-sheet/persona-switcher-sheet.tsx";
import type { ApplicationChromeMode, ApplicationChromeRoute } from "../application-chrome-model.ts";
import { AppHeader, MobileFooterNav } from "../app-shell-chrome/app-shell-chrome";
import { AppSidebar, SidebarContent, type SidebarItem } from "../app-sidebar/app-sidebar";
import { navigationPath, profilePath, profileSwitch, scopedPrimaryNavigation, primaryNavigationLabel, platformNavigationScope, navigationHomePath, type ApplicationNavigationScope, type CommunityNavigationState, type CommunityNavigationData } from "../navigation-model.ts";
import { NavigationDrawer, type DrawerCommunity } from "../navigation-drawer.tsx";
import { loadCommunityAppNavigation, loadCommunityNavigation as loadDefaultCommunityNavigation } from "../community-navigation-api.ts";
import type { ShellNavItem } from "../shell-model.ts";

export type MediaShellRoute = ApplicationChromeRoute;

export interface MediaShellProps {
  readonly children: JSX.Element;
  readonly activeItemId?: MediaShellRoute;
  readonly currentPath?: string;
  /** Resolve host scope before mounting, including server render and hydration. */
  readonly navigationScope?: ApplicationNavigationScope;
  /** Explicit fixtures or pre-resolved navigation data. */
  readonly communityNavigation?: CommunityNavigationState;
  readonly loadCommunityNavigation?: (signedIn: boolean) => Promise<CommunityNavigationData>;
  readonly mobileActiveItem?: ShellNavItem | "none";
  readonly mobileTitle?: string;
  readonly hideMobileHeader?: boolean;
  readonly mode?: ApplicationChromeMode;
  readonly navigate?: (href: string) => void;
  readonly signedIn?: boolean;
  /** Browser-only account identity invalidates private navigation after account changes. */
  readonly viewerId?: string;
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
  /** Membership-only fixture seam; production uses the complete API loader. */
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
  const scope = (): ApplicationNavigationScope => {
    const current = props.navigationScope ?? platformNavigationScope;
    if (current.kind !== "community") return current;
    if (!signedIn()) return { kind: "community", community: current.community };
    const state = navigationState();
    const permitted = state.kind === "ready" && state.data.moderated.some(item => item.communityId === current.community.communityId);
    return { ...current, moderationHref: current.moderationHref ?? (permitted ? `/c/${encodeURIComponent(current.community.communityId)}/settings/moderation_queue` : undefined) };
  };
  const communityScope = () => { const current = scope(); return current.kind === "community" ? current : undefined; };
  const homePath = () => navigationHomePath(scope());
  const activeItem = () => scope().kind === "community" && props.currentPath === homePath() ? "home" : props.activeItemId ?? "home";
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
    const href = id === "home" ? homePath() : navigationPath(id);
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
  // Community identity belongs to the operation target, not the account's
  // navigation profile. Never fall back to an unrelated account persona.
  const footerPersona = () => {
    if (!signedIn()) return undefined;
    const target = switchTarget();
    return target === undefined ? selected() : target.personas.find(persona => persona.personaId === selectedSwitchPersonaId());
  };
  const footerProfileLabel = () => {
    const persona = footerPersona();
    if (persona !== undefined) return `Profile, ${persona.displayName}`;
    if (switchTarget()?.unavailable) return "Retry profiles";
    if (switchTarget() !== undefined && switchable()) return "Choose a posting profile";
    return signedIn() || accountPending() ? "Your profiles" : "Sign in";
  };
  const desktopProfileLabel = () => {
    const persona = footerPersona();
    if (switchTarget()?.unavailable) return "Retry profiles";
    if (persona === undefined) return "Choose a posting profile";
    return switchable() ? `Switch posting profile, ${persona.displayName}` : `Open posting profile, ${persona.displayName}`;
  };
  const openFooterProfile = () => {
    if (!signedIn()) { openOwnProfile(); return; }
    const persona = footerPersona();
    if (switchTarget() !== undefined) {
      if (persona !== undefined) go(profilePath(persona));
      else if (switchable() || switchTarget()?.unavailable) personaStore?.openSwitcher();
      else openProfilePicker();
    } else openOwnProfile();
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
  const [communityOwner, setCommunityOwner] = createSignal<string>();
  const ownerKey = () => signedIn() ? `account:${props.viewerId ?? "unresolved"}` : "anonymous";
  const loadCommunities = () => {
    const request = ++communityRequest;
    setCommunities({ kind: "loading" });
    setCommunityOwner(ownerKey());
    const currentScope = scope();
    if (currentScope.kind === "community") {
      if (!signedIn()) { setCommunities({ kind: "hidden" }); return; }
      setCommunities({ kind: "loading" });
      void loadCommunityAppNavigation(currentScope.community.communityId)
        .then(data => { if (request === communityRequest) setCommunities({ kind: "ready", data }); })
        .catch(() => { if (request === communityRequest) setCommunities({ kind: "error" }); });
      return;
    }
    setCommunities({ kind: "loading" });
    const loading = props.loadCommunityNavigation
      ? props.loadCommunityNavigation(signedIn())
      : props.loadCommunities
        ? (signedIn() ? props.loadCommunities() : Promise.resolve([])).then(joined => ({ joined, popular: [], moderated: [] }))
        : loadDefaultCommunityNavigation(signedIn());
    void loading
      .then(data => { if (request === communityRequest) setCommunities({ kind: "ready", data }); })
      .catch(() => { if (request === communityRequest) setCommunities({ kind: "error" }); });
  };
  onCleanup(() => { communityRequest++; });
  createEffect(() => [signedIn(), props.sessionResolving, props.communityNavigation, props.viewerId, props.navigationScope?.kind, props.navigationScope?.kind === "community" ? props.navigationScope.community.communityId : undefined] as const, ([, resolving, supplied]) => {
    const request = ++communityRequest;
    queueMicrotask(() => {
      if (request !== communityRequest || supplied) return;
      if (resolving) { setCommunities({ kind: "loading" }); return; }
      loadCommunities();
    });
  });
  const navigationState = (): CommunityNavigationState => props.communityNavigation ?? (communityOwner() === ownerKey() ? communities() : { kind: "loading" });

  createEffect(() => props.activeItemId, (_, previous) => { if (previous !== undefined) setMenuOpen(false); });
  createEffect(desktop, (wide, previous) => { if (wide && previous === false) setMenuOpen(false); });
  const primaryItems = (): readonly SidebarItem[] => scopedPrimaryNavigation(scope()).map(item => ({
    ...item,
    href: item.id === "profile" && selected() ? profilePath(selected()!) : item.href,
    iconKind: item.id,
    avatar: item.id === "profile" ? { fallback: selected()?.displayName ?? "Profile", seed: selected()?.avatarSeed ?? selected()?.displayName, src: selected()?.avatarSrc } : undefined,
  }));
  const profileLabel = () => selected() ? `Switch profile, currently ${selected()!.displayName}` : "Profile";
  /** Desktop only: the phone has footer tabs and the communities drawer. */
  function NavigationSidebar() {
    // Keep the projection reactive and pure; the sidebar owns icon rendering.
    const items = createMemo(primaryItems);
    return <AppSidebar activeItemId={activeItem()} class="sticky top-0 hidden h-dvh md:flex" accountControl={signedIn() || props.sessionResolving || props.sessionUnavailable ? { label: profileLabel(), displayName: selected()?.displayName ?? "Profile", handle: selected()?.publicHandle, avatarSrc: selected()?.avatarSrc, avatarSeed: selected()?.avatarSeed, onClick: openProfilePicker } : undefined} signInAction={{ onClick: requestGlobalSignIn, prepare: prepareGlobalSignIn, preload: preloadGlobalSignInAssets }} homeAriaLabel="Go home" brandLabel={communityScope()?.community.displayName} onHomeClick={() => go(homePath())} onNavigate={navigateById} primaryItems={items()} communityState={navigationState()} navigationScope={scope()} currentPath={props.currentPath} onNavigateCommunity={go} onRetryCommunities={loadCommunities} />;
  }

  return <Show when={mode() !== "bare"} fallback={props.children}><div data-application-chrome data-media-shell data-shell-mode={mode()} data-shell-auth={props.sessionResolving ? "resolving" : props.sessionUnavailable ? "unavailable" : signedIn() ? "authenticated" : "anonymous"} class={`min-h-screen bg-background text-foreground ${props.class ?? ""}`}>
    <div class="flex min-h-screen">
      <NavigationSidebar />
      <Sheet open={menuOpen()} onOpenChange={setMenuOpen}>
        <SheetContent side="left" onCloseAutoFocus={afterMenuClose} class="flex h-dvh w-80 max-w-[85vw] flex-col gap-0 bg-sidebar p-0 text-sidebar-foreground md:hidden" aria-label="Navigation">
          <SheetHeader class="sr-only"><SheetTitle>Navigation</SheetTitle></SheetHeader>
          <NavigationDrawer state={navigationState()} scope={scope()} currentPath={props.currentPath} onNavigate={go} onRetry={loadCommunities} />
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
                <Show when={immersive() && scope().kind === "platform"}>
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
          avatarFallback={footerPersona()?.displayName ?? "Profile"}
          labels={{
            home: scope().kind === "community" ? "Home" : primaryNavigationLabel("home"),
            songs: primaryNavigationLabel("songs"),
            wallet: primaryNavigationLabel("wallet"),
            profile: primaryNavigationLabel("profile"),
            // Matches what a tap does: the selected profile's page, the profile
            // sheet while the account check is pending or failed, or sign-in.
            profileAriaLabel: footerProfileLabel(),
          }}
          onHomeClick={() => go(homePath())}
          onSongsClick={() => go("/songs")}
          onWalletClick={() => go("/wallet")}
          onProfileClick={openFooterProfile}
          onProfileDoubleTap={canSwitchProfile() ? doubleTapSwitch : undefined}
          userAvatarSeed={footerPersona()?.avatarSeed ?? footerPersona()?.publicHandle ?? undefined}
          userAvatarSrc={footerPersona()?.avatarSrc ?? undefined}
        />
        <Show when={signedIn() && ((switchTarget()?.personas.length ?? 0) > 0 || switchTarget()?.unavailable)}>
          <CommunityPersonaControl
            desktopOnly
            label={desktopProfileLabel()}
            opensPicker={switchable() || switchTarget()?.unavailable === true}
            persona={footerPersona()}
            onClick={() => { if (switchable() || switchTarget()?.unavailable) personaStore?.openSwitcher(); else openFooterProfile(); }}
          />
        </Show>
        <Show when={personaStore === undefined ? undefined : switchTarget()}>
          {(target) => (
            <PersonaSwitcherSheet
              onOpenChange={(open) => { if (!open) personaStore!.closeSwitcher(); }}
              onSelect={(personaId) => {
                personaStore!.selectPersona(target().communityId, personaId);
                personaStore!.closeSwitcher();
              }}
              loading={target().loading}
              unavailable={target().unavailable}
              onRetry={target().onRetry}
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
    <PersonaSwitcherSheet footer={<Show when={signedIn() && !selected()}><a href="/settings" class="mx-4 mt-4 rounded-lg px-3 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={event => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); go("/settings"); }}>Settings</a></Show>} title="Your profiles" onAfterClose={afterPickerClose} open={pickerOpen()} onOpenChange={setPickerOpen} personas={props.personas ?? []} selectedPersonaId={props.selectedPersonaId ?? ""} onSelect={id => { props.onPersonaSelect?.(id); setPickerOpen(false); }} loading={props.sessionResolving || props.personasLoading || (props.sessionUnavailable && props.sessionPending)} unavailable={props.sessionUnavailable || props.personasUnavailable} onRetry={props.sessionUnavailable ? props.onSessionRetry : props.onPersonasRetry} />
  </div></Show>;
}

/** Story and compatibility export; production mounts `ApplicationChrome` once. */
export const MediaShell = ApplicationChrome;
