import { useParams } from "@solidjs/router";
import { KaraokeLeaderboardRouteView } from "../../../../features/karaoke/karaoke-route-view";

export default function KaraokeLeaderboardRoute() {
  const params = useParams<{ postId: string }>();
  return <KaraokeLeaderboardRouteView postId={params.postId} />;
}
