import { useNavigate } from "@solidjs/router";

import { VideoCreateRouteView } from "../../features/posts/video-submission/video-create-route.tsx";

export default function VideoCreateRoute() {
  const navigate = useNavigate();
  return <VideoCreateRouteView navigate={(href) => navigate(href)} />;
}
