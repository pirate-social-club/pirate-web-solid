import { createRequestEvent, renderToString } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { createRouter } from "@solidjs/router";
import { expect, test, vi } from "vitest";
import { ApplicationSessionProvider } from "../shell/application-session";
import { YourSongsRouteView } from "./your-songs-route";

const paths = ["/songs", "/study", "/karaoke"];
const Router = createRouter({ routes: paths.map(path => ({ path })) });

test.each(paths)("unreleased library alias %s offers an honest feed escape without requesting sign-in", path => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  try {
    const event = createRequestEvent(new Request(`https://pirate.sc${path}`));
    const html = provideRequestEvent(event, () => renderToString(() => <Router>{() => <ApplicationSessionProvider state={() => "anonymous"}><YourSongsRouteView /></ApplicationSessionProvider>}</Router>));
    expect(html).toContain("Song history is coming soon"); expect(html).toContain("Browse For You");
    expect(html).not.toContain("Sign in to see your songs"); expect(html).not.toContain("Try again"); expect(fetcher).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});
