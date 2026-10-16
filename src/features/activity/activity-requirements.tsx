import { isServer } from "@solidjs/web";
import type { GetRewardsQualificationPoliciesResponse } from "@pirate/api-client";
import { For, Show, createSignal, onCleanup } from "solid-js";
import { createSessionApiClient } from "../../api/client.ts";
import { Button, Type } from "../../design-system.ts";
import { qualificationText } from "../rewards/reward-sponsor-terms.ts";
import type { ActivityClient } from "./activity-api.ts";

/** Authenticated host only. Published requirements never prove that an attempt qualified. */
export function ActivityRequirements(props: { readonly client?: ActivityClient }) {
  const [policies, setPolicies] = createSignal<GetRewardsQualificationPoliciesResponse["policies"]>([]);
  const [state, setState] = createSignal<"loading" | "ready" | "error">("loading");
  let disposed = false;
  let generation = 0;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const load = async () => {
    controller?.abort(); clearTimeout(timer);
    const revision = ++generation;
    const request = new AbortController(); controller = request;
    const current = () => !disposed && revision === generation && !request.signal.aborted;
    setState("loading"); setPolicies([]);
    timer = setTimeout(() => { if (current()) { request.abort(); setState("error"); } }, 15_000);
    try {
      const result = await (props.client ?? createSessionApiClient()).get_rewardsQualificationPolicies(undefined, { signal: request.signal });
      if (current()) { setPolicies(result.policies); setState("ready"); }
    } catch { if (current()) setState("error"); }
    finally { if (revision === generation) clearTimeout(timer); }
  };
  if (!isServer) queueMicrotask(() => { if (!disposed) void load(); });
  onCleanup(() => { disposed = true; ++generation; controller?.abort(); clearTimeout(timer); });
  return <section aria-label="Qualification requirements" class="space-y-2 border-t border-border-soft pt-3 text-sm">
    <Type as="h3" variant="body-strong">Qualification requirements</Type>
    <Show when={state() !== "loading"} fallback={<p role="status">Loading qualification requirements…</p>}>
      <Show when={state() === "ready"} fallback={<><p role="alert">Qualification requirements are unavailable.</p><Button variant="secondary" onClick={() => { void load(); }}>Retry requirements</Button></>}>
        <For each={policies()} fallback={<p>No qualification requirements returned.</p>}>{policy => <p>{qualificationText(policy)}</p>}</For>
      </Show>
    </Show>
    <p class="text-muted-foreground">These requirements do not confirm qualification for your latest attempt. Your standing shows the streak days the server has recorded.</p>
  </section>;
}
