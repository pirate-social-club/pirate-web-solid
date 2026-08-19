import { Title } from "@solidjs/meta";
import { Show, createEffect, createSignal } from "solid-js";
import { FormNote, Type } from "../../design-system";
import {
  fetchFundingHarnessConfig,
  type FundingHarnessPublicConfig,
} from "../../api/funding-harness.ts";
import {
  CommunityPurchaseFundingQuotePanel,
  createCommunityPurchaseFundingClient,
} from "../../features/community-purchase-funding/index.ts";

type Phase = "loading" | "ready" | "unavailable";

/**
 * Staging-only harness for the reload-safe funding quote panel. The fixture
 * community/listing identifiers arrive through the env-gated worker config;
 * outside staging the config is absent and this route explains that it is
 * unavailable. No admission or wallet transaction exists on this surface.
 */
export default function StagingFundingQuoteRoute() {
  const [phase, setPhase] = createSignal<Phase>("loading");
  const [config, setConfig] = createSignal<FundingHarnessPublicConfig>();

  createEffect(
    () => true,
    () => {
      if (typeof window === "undefined") return;
      void fetchFundingHarnessConfig().then(
        value => {
          setConfig(value);
          setPhase("ready");
        },
        () => setPhase("unavailable"),
      );
    },
  );

  return (
    <main data-route-path="/staging/funding-quote" class="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
      <Title>Staging funding quote harness</Title>
      <Show when={phase() === "loading"}>
        <FormNote>Loading the staging harness configuration…</FormNote>
      </Show>
      <Show when={phase() === "unavailable"}>
        <Type as="p" variant="body">
          The funding quote harness is not enabled in this environment.
        </Type>
      </Show>
      <Show when={phase() === "ready" ? config() : undefined}>
        {value => (
          <>
            <Type as="p" class="text-muted-foreground" variant="caption">
              Staging harness for the reload-safe funding quote. Sign in through the verification
              page first; no wallet transaction or admission is possible here.
            </Type>
            <CommunityPurchaseFundingQuotePanel
              communityId={value().communityId}
              listingId={value().listingId}
              client={createCommunityPurchaseFundingClient()}
            />
          </>
        )}
      </Show>
    </main>
  );
}
