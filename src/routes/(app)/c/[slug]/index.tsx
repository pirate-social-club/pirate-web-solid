import { Link, Meta, Title } from "@solidjs/meta";
import { useParams } from "@solidjs/router";

export default function CommunityRoute() {
  const params = useParams();
  return (
    <main data-route-path="/c/:slug" data-route-slug={params.slug}>
      <Title>Community {params.slug} · Pirate Web</Title>
      <Meta property="og:title" content={`Community ${params.slug}`} />
      <Meta property="og:type" content="website" />
      <Link rel="canonical" href={`/c/${params.slug}`} />
      <h1>Community: {params.slug}</h1>
      <a href={`/c/${params.slug}/threads`}>View threads</a>
    </main>
  );
}
