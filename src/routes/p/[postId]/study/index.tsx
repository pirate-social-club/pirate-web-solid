import { useNavigate, useParams } from "@solidjs/router";

import { StudyV2RouteView } from "../../../../features/studying/study-v2-route-view";

export default function StudyPostRoute() {
  const navigate = useNavigate();
  const params = useParams<{ postId: string }>();
  return <StudyV2RouteView navigate={(href) => navigate(href)} postId={params.postId} />;
}
