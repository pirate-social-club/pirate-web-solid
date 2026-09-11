import { createRouter, useLocation, useNavigate } from "@solidjs/router";
import { fileRoutes } from "@solidjs/router/fs";
import { Errored, Loading, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { getRequestEvent, type JSX } from "@solidjs/web";
import { pageRoutes } from "virtual:file-routes";
import { resolveSession, onSessionRefreshed, refreshSession } from "./api/session.ts";
import { GlobalSignInHost } from "./features/auth/global-sign-in-host.tsx";
import { buildPublicProfilePath } from "./features/profiles/public-profile-page/public-profile-page.model.ts";
import { resolveApplicationChrome } from "./features/shell/application-chrome-model.ts";
import {
  ApplicationSessionProvider,
  type ApplicationSessionState,
} from "./features/shell/application-session.tsx";
import { ApplicationChrome } from "./features/shell/media-shell/media-shell.tsx";
import { RootErrorState } from "./features/shell/app-shell/app-shell.tsx";
import { transformDirectHnsCommunityRootPath } from "./hns-community-route-transform.ts";
import "./index.css";

const Router = createRouter({
  routes: fileRoutes(pageRoutes),
  transformUrl: pathname => transformDirectHnsCommunityRootPath(
    pathname,
    globalThis.window?.location.hostname,
  ),
});

function ApplicationRoot(props: { readonly children: JSX.Element }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = createSignal<ApplicationSessionState>("resolving");
  /**
   * The viewer's own public profile, once the account personas resolve. Until
   * then the Profile destination stays with the unlisted fallback.
   */
  const profileHref = createMemo(() => {
    const current = session();
    if (typeof current !== "object" || current.status !== "authenticated") return undefined;
    if (!("personas" in current)) return undefined;
    const handle = current.personas.find(persona => persona.primaryPublicHandle !== null)?.primaryPublicHandle;
    return handle ? buildPublicProfilePath(handle) : undefined;
  });
  const policy = createMemo(() => resolveApplicationChrome(location.pathname, profileHref()));
  let active = true;
  let sessionRequest = 0;
  let accountInFlight = false;
  const [accountPending, setAccountPending] = createSignal(true);
  const retryAccount = () => { if (!accountInFlight) refreshSession(); };

  createEffect(
    () => true,
    () => {
      if (typeof window === "undefined") return;
      const update = () => {
        const request = ++sessionRequest;
        accountInFlight = true;
        setAccountPending(true);
        // Refresh invalidates a previous anonymous result (including sign-in),
        // while authenticated and failed chrome remain stable during the read.
        if (session() === "anonymous") setSession("resolving");
        void resolveSession()
          .then(result => { if (active && request === sessionRequest) setSession(result); })
          .catch(() => { if (active && request === sessionRequest) setSession("failed"); })
          .finally(() => {
            if (active && request === sessionRequest) {
              accountInFlight = false;
              setAccountPending(false);
            }
          });
      };
      update();
      // A successful sign-in refreshes the shared store instead of reloading
      // the document; re-resolve here so the chrome flips reactively.
      onCleanup(onSessionRefreshed(update));
    },
  );
  onCleanup(() => { active = false; });

  return (
    <ApplicationSessionProvider state={session}>
      <ApplicationChrome
        activeItemId={policy().activeItemId}
        mobileActiveItem={policy().mobileActiveItem}
        mobileTitle={policy().mobileTitle}
        mode={policy().mode}
        navigate={(href) => navigate(href)}
        signedIn={session() !== "resolving" && session() !== "anonymous" && session() !== "failed"}
        sessionUnavailable={session() === "failed"}
        sessionResolving={session() === "resolving"}
        sessionPending={accountPending()}
        onSessionRetry={retryAccount}
        profileHref={profileHref()}
      >
        <Errored fallback={(_, reset) => <RootErrorState onHome={() => { reset(); navigate("/"); }} />}>
          {props.children}
        </Errored>
      </ApplicationChrome>
    </ApplicationSessionProvider>
  );
}

export default function App() {
  const requestEvent = getRequestEvent();
  const serverUrl = typeof window === "undefined" ? requestEvent?.request.url : undefined;
  return (
    <Loading fallback={null}>
      <Router url={serverUrl}>{props => <ApplicationRoot>{props.children}</ApplicationRoot>}</Router>
      <GlobalSignInHost />
    </Loading>
  );
}
