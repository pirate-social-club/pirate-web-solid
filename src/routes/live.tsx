import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { Button, Type } from "../design-system";

export default function LiveRoute() {
  const navigate = useNavigate();
  return <main data-route-path="/live" class="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
    <Title>Live</Title><Type as="h1" variant="h1">Live</Type>
    <Type>Live broadcasts are not available yet.</Type>
    <Button class="self-start" onClick={() => navigate("/")}>Watch videos</Button>
  </main>;
}
