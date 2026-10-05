import { Show, createSignal, createEffect, onCleanup } from "solid-js";
import { buttonVariants } from "../../design-system.ts";
import { useApplicationPersonas } from "../shell/application-personas.tsx";
import { useApplicationSession } from "../shell/application-session.tsx";

/** Public profile HTML is cached; viewer controls resolve only in the browser. */
export function OwnProfileSettings(props: { personaId?: string; handle?: string }) {
  const account = useApplicationSession();
  const profiles = useApplicationPersonas();
  const [mounted, setMounted] = createSignal(false);
  let active = true;
  onCleanup(() => { active = false; });
  createEffect(() => typeof window !== "undefined", browser => {
    if (browser) queueMicrotask(() => { if (active) setMounted(true); });
  });
  const ownsProfile = () => {
    if (!mounted() || typeof account() !== "object") return false;
    return profiles?.personas().some(profile => props.personaId
      ? profile.personaId === props.personaId
      : profile.publicHandle?.toLowerCase() === props.handle?.toLowerCase()) ?? false;
  };
  return <Show when={ownsProfile()}><a class={buttonVariants({ variant: "default", class: "w-full md:w-auto" })} href="/settings">Settings</a></Show>;
}
