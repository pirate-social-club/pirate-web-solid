import { useParams } from "@solidjs/router";
import PublicProfilePage from "../../features/profiles/public-profile-page/public-profile-page.tsx";

export default function PublicProfileRoute() {
  const params = useParams();
  return <PublicProfilePage handle={params.handle ?? ""} />;
}
