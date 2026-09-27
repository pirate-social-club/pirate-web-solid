import { useNavigate } from "@solidjs/router";
import { Button, Type } from "../design-system";

export default function ActivityRoute() {
  const navigate = useNavigate();
  return <main data-route-path="/activity" class="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
    <Type as="h1" variant="h1">Notifications are unavailable</Type>
    <Button class="self-start" onClick={() => navigate("/")}>Go home</Button>
  </main>;
}
