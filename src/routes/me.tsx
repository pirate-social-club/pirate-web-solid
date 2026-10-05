import { useNavigate } from "@solidjs/router";
import { Show, createEffect } from "solid-js";
import { AccountPage } from "../features/shell/account-page.tsx";
import { useApplicationPersonas } from "../features/shell/application-personas.tsx";
import { profilePath } from "../features/shell/navigation-model.ts";

export default function ProfileRoute() {
  const navigate = useNavigate();
  const profiles = useApplicationPersonas();
  createEffect(() => profiles?.selected(), profile => {
    if (profile) navigate(profilePath(profile), { replace: true });
  });
  return <Show when={!profiles?.selected()} fallback={<p role="status">Opening your profile…</p>}>
    <AccountPage profile navigate={href => navigate(href)} />
  </Show>;
}
