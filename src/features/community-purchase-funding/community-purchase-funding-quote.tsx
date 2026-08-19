import { ApiClientError } from "@pirate/api-client";
import { Show, createEffect, createSignal } from "solid-js";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormNote,
  Type,
} from "../../design-system";
import {
  browserFundingDraftStorage,
  CommunityPurchaseFundingDraftController,
  type CommunityPurchaseFundingIntent,
  type CommunityPurchaseFundingQuote,
  type FundingDraftStorage,
  type FundingQuoteClient,
} from "./funding-draft";

export interface CommunityPurchaseFundingQuoteProps {
  readonly communityId: string;
  readonly listingId: string;
  readonly client: FundingQuoteClient;
  readonly storage?: FundingDraftStorage;
  readonly now?: () => number;
}

type QuotePanelPhase = "idle" | "loading" | "ready" | "expired" | "error";

function memoryStorage(): FundingDraftStorage {
  let value: string | null = null;
  return {
    getItem: () => value,
    setItem: (_key, next) => { value = next; },
    removeItem: () => { value = null; },
  };
}

function formatAtomicAmount(amount: string, decimals: number): string {
  const padded = amount.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/u, "");
  return fraction === "" ? whole : `${whole}.${fraction}`;
}

function shortAddress(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "Sign in with a wallet-linked session to request a quote.";
    if (error.status === 404) return "This community listing is not available.";
    if (error.status === 409) return "This listing cannot be quoted right now.";
    if (error.status === 502) return "The quote service is temporarily unavailable. Try again.";
  }
  if (error instanceof Error && error.message === "missing_csrf") {
    return "Your session needs to be refreshed before requesting a quote.";
  }
  return "We could not create a quote. Please try again.";
}

function quoteIntent(props: CommunityPurchaseFundingQuoteProps): CommunityPurchaseFundingIntent {
  return { community_id: props.communityId, listing_id: props.listingId };
}

export function CommunityPurchaseFundingQuote(props: CommunityPurchaseFundingQuoteProps) {
  const [phase, setPhase] = createSignal<QuotePanelPhase>("idle", { ownedWrite: true });
  const [quote, setQuote] = createSignal<CommunityPurchaseFundingQuote | null>(null, { ownedWrite: true });
  const [error, setError] = createSignal<string | null>(null, { ownedWrite: true });
  let controller: CommunityPurchaseFundingDraftController | undefined;

  createEffect(
    () => quoteIntent(props),
    intent => {
      // Rebuild the controller when the parent moves to another listing. The
      // persisted draft itself is keyed by the intent and is validated again.
      controller = new CommunityPurchaseFundingDraftController({
        storage: props.storage ?? browserFundingDraftStorage() ?? memoryStorage(),
        client: props.client,
        now: props.now,
      });
      const state = controller.state();
      if (state.kind === "ready" && state.draft.intent.community_id === intent.community_id && state.draft.intent.listing_id === intent.listing_id) {
        setQuote(state.draft.quote);
        setPhase("ready");
      } else if (state.kind === "expired") {
        setQuote(null);
        setPhase("expired");
      } else {
        setQuote(null);
        setPhase("idle");
      }
      setError(null);
    },
  );

  const requestQuote = () => {
    if (controller === undefined || phase() === "loading") return;
    setPhase("loading");
    setError(null);
    void controller.createOrResumeQuote(quoteIntent(props)).then(
      value => {
        setQuote(value);
        setPhase("ready");
      },
      reason => {
        setQuote(null);
        setPhase("error");
        setError(errorMessage(reason));
      },
    );
  };

  return (
    <Card data-funding-quote-state={phase()}>
      <CardHeader>
        <CardTitle>Funding quote</CardTitle>
        <CardDescription>
          The server derives the amount, recipient, token, and expiry from the listing policy.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-5">
        <Show when={phase() === "idle" || phase() === "expired" || phase() === "error"}>
          <Button disabled={phase() === "loading"} loading={phase() === "loading"} onClick={requestQuote} type="button">
            {phase() === "expired" ? "Refresh expired quote" : "Get quote"}
          </Button>
        </Show>

        <Show when={phase() === "loading"}>
          <div aria-live="polite" role="status"><FormNote>Preparing a server quote…</FormNote></div>
        </Show>

        <Show when={error()}>
          <div aria-live="assertive" role="alert"><FormNote tone="warning">{error()}</FormNote></div>
        </Show>

        <Show when={quote()}>
          {value => (
            <section aria-label="Server-derived funding terms" class="space-y-4" data-funding-quote-result>
              <Show when={value().replayed}>
                <div aria-live="polite" role="status"><FormNote>This is the exact server replay of your existing quote.</FormNote></div>
              </Show>
              <dl class="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt class="text-muted-foreground">Amount</dt><dd>{formatAtomicAmount(value().funding.amount_atomic, value().funding.token_decimals)} atomic units</dd></div>
                <div><dt class="text-muted-foreground">Chain</dt><dd>{value().funding.chain_id}</dd></div>
                <div><dt class="text-muted-foreground">Sender</dt><dd><code>{shortAddress(value().funding.sender)}</code></dd></div>
                <div><dt class="text-muted-foreground">Recipient</dt><dd><code>{shortAddress(value().funding.recipient)}</code></dd></div>
                <div><dt class="text-muted-foreground">Confirmations</dt><dd>{value().funding.required_confirmations}</dd></div>
                <div><dt class="text-muted-foreground">Expires</dt><dd>{value().expires_at}</dd></div>
              </dl>
              <Type as="p" class="text-muted-foreground" variant="caption">
                Quote {value().quote_id}. No wallet transaction is requested here; admission remains unavailable.
              </Type>
            </section>
          )}
        </Show>
      </CardContent>
    </Card>
  );
}
