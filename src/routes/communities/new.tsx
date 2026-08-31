import { useNavigate, useSearchParams } from "@solidjs/router";
import { CommunityCreationRouteView } from "../../features/community/community-creation-route-view";

export default function CreateCommunityRoute() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const intentId = () => typeof search.intent_id === "string" ? search.intent_id : undefined;
  return (
    <CommunityCreationRouteView
      intentId={intentId()}
      navigate={(href, options) => navigate(href, options)}
    />
  );
}
