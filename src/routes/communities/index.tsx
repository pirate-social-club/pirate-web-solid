import { useNavigate, useSearchParams } from "@solidjs/router";

import { YourCommunitiesRouteView } from "../../features/community/your-communities-page/your-communities-route.tsx";

/** Only the exact compose marker names a create intent, mirroring the
 * community page's strict `compose=video&song=` parse. */
export function createIntentFromSearch(search: Record<string, string | string[] | undefined>): "video" | undefined {
  return search.compose === "video" ? "video" : undefined;
}

export default function YourCommunitiesRoute() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  return (
    <YourCommunitiesRouteView
      createIntent={createIntentFromSearch(searchParams)}
      clearCreateIntent={() => setSearchParams({ compose: undefined }, { replace: true, scroll: false })}
      navigate={(href) => navigate(href)}
    />
  );
}
