import { useNavigate, useSearchParams } from "@solidjs/router";

import { YourCommunitiesRouteView } from "../../features/community/your-communities-page/your-communities-route.tsx";
import { initialVideoSongFromSearch } from "../../features/posts/public-post/song-video-entry.tsx";

export default function YourCommunitiesRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  return <YourCommunitiesRouteView initialVideoSong={initialVideoSongFromSearch(searchParams)} navigate={(href) => navigate(href)} />;
}
