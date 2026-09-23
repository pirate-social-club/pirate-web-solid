import { Title } from "@solidjs/meta";
import { createSignal, Show } from "solid-js";
import { Avatar, Button, Card, CardContent, Type } from "../../design-system";
import { createSessionApiClient, readCsrfCookie, sessionRequestOptions } from "../../api/client.ts";
import { clearSession } from "../../api/session.ts";
import { requestGlobalSignIn } from "../auth/global-sign-in-host.tsx";
import { useApplicationPersonas } from "./application-personas.tsx";
import { useApplicationSession } from "./application-session.tsx";
import { RecordingsSettings, type DeleteRecordings } from "./recordings-settings.tsx";

export function AccountPage(props: { navigate: (href: string) => void; profile?: boolean; deleteRecordings?: DeleteRecordings }) {
  const account = useApplicationSession();
  const personas = useApplicationPersonas();
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal("");
  const title = () => props.profile ? "Profile" : "Settings";
  const signOut = async () => {
    if (pending()) return;
    setPending(true);
    setError("");
    try {
      const csrf = readCsrfCookie();
      if (!csrf) throw new Error("csrf_unavailable");
      await createSessionApiClient().post_authSessionLogout(undefined, sessionRequestOptions(csrf));
      clearSession();
      props.navigate("/");
    } catch {
      setError("Sign out failed. Please try again.");
    } finally { setPending(false); }
  };
  return <main class="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-8" data-route-path={props.profile ? "/me" : "/settings"}>
    <Title>{title()}</Title><Type as="h1" variant="h1">{title()}</Type>
    <Card><CardContent class="flex flex-col gap-4 p-5">
      <Show when={typeof account() === "object"} fallback={<>
        <Type>{account() === "anonymous" ? "Sign in to manage your profiles." : account() === "failed" ? "Your account could not be checked." : "Checking your account…"}</Type>
        <Show when={account() === "anonymous" || account() === "failed"}>
          <Button class="self-start" variant={account() === "anonymous" ? "default" : "outline"} onClick={() => account() === "anonymous" ? requestGlobalSignIn() : personas?.setPickerOpen(true)}>{account() === "anonymous" ? "Sign in" : "Check again"}</Button>
        </Show>
      </>}>
        <Show when={personas?.selected()}>{persona => <div class="flex items-center gap-3"><Avatar fallback={persona().displayName} src={persona().avatarSrc ?? undefined} fallbackSeed={persona().displayName} /><div class="min-w-0"><Type as="p" variant="body-strong">{persona().displayName}</Type><Type as="p" variant="caption">{persona().publicHandle}</Type></div></div>}</Show>
        <div class="flex flex-wrap gap-2">
          <Button onClick={() => personas?.setPickerOpen(true)}>Switch profile</Button>
          <Show when={personas?.selected()}><Button variant="outline" onClick={() => props.navigate(`/p/${encodeURIComponent(personas!.selected()!.personaId)}`)}>View profile</Button></Show>
          <Button variant="outline" onClick={() => props.navigate("/wallet")}>Wallet</Button>
        </div>
        <Button class="self-start" variant="ghost" onClick={() => void signOut()} disabled={pending()}>{pending() ? "Signing out…" : "Sign out"}</Button>
      </Show>
      <Show when={error()}><Type role="alert">{error()}</Type></Show>
    </CardContent></Card>
    <Show when={typeof account() === "object"}>
      <Card><CardContent class="p-5"><RecordingsSettings deleteRecordings={props.deleteRecordings} /></CardContent></Card>
    </Show>
    <div class="flex gap-4"><a href="/terms">Terms</a><a href="/privacy">Privacy</a></div>
  </main>;
}
