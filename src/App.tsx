import { createRouter } from "@solidjs/router";
import { fileRoutes } from "@solidjs/router/fs";
import { getRequestEvent } from "@solidjs/web";
import { pageRoutes } from "virtual:file-routes";
import "./index.css";

const Router = createRouter({ routes: fileRoutes(pageRoutes) });

export default function App() {
  const requestEvent = getRequestEvent();
  const serverUrl = typeof window === "undefined" ? requestEvent?.request.url : undefined;
  return <Router url={serverUrl}>{props => props.children}</Router>;
}
