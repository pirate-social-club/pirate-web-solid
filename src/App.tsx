import { createRouter } from "@solidjs/router";
import { fileRoutes } from "@solidjs/router/fs";
import { Loading } from "solid-js";
import { getRequestEvent } from "@solidjs/web";
import { pageRoutes } from "virtual:file-routes";
import { GlobalSignInHost } from "./features/auth/global-sign-in-host.tsx";
import { transformDirectHnsCommunityRootPath } from "./hns-community-route-transform.ts";
import "./index.css";

const Router = createRouter({
  routes: fileRoutes(pageRoutes),
  transformUrl: pathname => transformDirectHnsCommunityRootPath(
    pathname,
    globalThis.window?.location.hostname,
  ),
});

export default function App() {
  const requestEvent = getRequestEvent();
  const serverUrl = typeof window === "undefined" ? requestEvent?.request.url : undefined;
  return (
    <Loading fallback={null}>
      <Router url={serverUrl}>{props => props.children}</Router>
      <GlobalSignInHost />
    </Loading>
  );
}
