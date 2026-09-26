import { useNavigate } from "@solidjs/router";

import { YourCommunitiesRouteView } from "../../features/community/your-communities-page/your-communities-route.tsx";

export default function YourCommunitiesRoute() {
  const navigate = useNavigate();
  return <YourCommunitiesRouteView navigate={(href) => navigate(href)} />;
}
