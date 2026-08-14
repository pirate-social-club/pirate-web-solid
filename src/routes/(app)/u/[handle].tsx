import { Link, Meta, Title } from "@solidjs/meta";
import { useParams } from "@solidjs/router";

export default function ProfileRoute() {
  const params = useParams();
  return (
    <main data-route-path="/u/:handle" data-route-handle={params.handle}>
      <Title>@{params.handle} · Pirate Web</Title>
      <Meta property="og:title" content={`@${params.handle}`} />
      <Link rel="canonical" href={`/u/${params.handle}`} />
      <h1>Profile: @{params.handle}</h1>
    </main>
  );
}
