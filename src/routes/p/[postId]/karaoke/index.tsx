import { useParams } from "@solidjs/router";
import { KaraokeSessionRouteView } from "../../../../features/karaoke/karaoke-route-view";

export default function KaraokeRoute() {
  const params = useParams<{ postId: string }>();
  return <KaraokeSessionRouteView postId={params.postId} />;
}
