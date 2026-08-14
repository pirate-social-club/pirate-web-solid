import { Link, Meta, Title } from "@solidjs/meta";
import { useParams } from "@solidjs/router";

export default function CommunityThreadsRoute() {
  const params = useParams();
  return (
    <main data-route-path="/c/:slug/threads" data-route-slug={params.slug}>
      <Title>Threads · {params.slug}</Title>
      <Meta name="description" content={`Threads for community ${params.slug}`} />
      <Meta property="og:title" content={`Threads · ${params.slug}`} />
      <Link rel="canonical" href={`/c/${params.slug}/threads`} />
      <h1>Threads for {params.slug}</h1>
      <a href={`/c/${params.slug}`}>Back to community</a>
    </main>
  );
}
