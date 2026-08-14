import { Link, Meta, Title } from "@solidjs/meta";
import { useParams } from "@solidjs/router";

export default function PostRoute() {
  const params = useParams();
  return (
    <main data-route-path="/p/:id" data-route-id={params.id}>
      <Title>Post {params.id} · Pirate Web</Title>
      <Meta property="og:title" content={`Post ${params.id}`} />
      <Link rel="canonical" href={`/p/${params.id}`} />
      <h1>Post: {params.id}</h1>
    </main>
  );
}
