import { useNavigate } from "@solidjs/router";
import { requestGlobalSignIn } from "../auth/global-sign-in-host.tsx";
import { useApplicationSession } from "../shell/application-session.tsx";
import { useApplicationPersonas } from "../shell/application-personas.tsx";
import { YourSongsPage } from "./your-songs-page.tsx";
import { createYourSongs } from "./your-songs-model.ts";
import { songLibrarySource } from "./your-songs-api.ts";

export function YourSongsRouteView() {
  const account = useApplicationSession();
  const personas = useApplicationPersonas();
  const navigate = useNavigate();
  if (songLibrarySource === undefined) {
    return <YourSongsPage songs={[]} navigate={navigate} onSignIn={requestGlobalSignIn} state={account() === "anonymous" ? "signed-out" : "not-yet-available"} />;
  }
  const library = createYourSongs(() => account() ?? "resolving", () => personas?.selected()?.personaId, songLibrarySource);
  const state = () => {
    if (account() === "anonymous") return "signed-out" as const;
    if (account() === undefined || account() === "resolving" || personas?.loading() || (library.loading() && library.songs().length === 0)) return "loading" as const;
    if (account() === "failed" || !personas?.selected() || (library.failed() && library.songs().length === 0)) return "unavailable" as const;
    return "ready" as const;
  };
  return <YourSongsPage songs={library.songs()} navigate={navigate} onSignIn={requestGlobalSignIn}
    state={state()} onRetry={() => { if (account() === "failed" || !personas?.selected()) personas?.setPickerOpen(true); else library.reload(); }}
    onLoadMore={library.hasMore() ? library.loadMore : undefined} loadingMore={library.loading()}
    loadMoreFailed={library.failed() && library.songs().length > 0}
    trending={library.trending()} trendingState={library.trendingState()} onTrendingRetry={library.reloadTrending} />;
}
