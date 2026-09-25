import { For, Show, createSignal, onSettled } from "solid-js";
import { Button, Card, CardContent, Type } from "../../design-system";
import type { RewardClaimData, RewardCredit } from "../../api/reward-claim.ts";
import { claimStep, verifyToClaimUrl, winningViews } from "./winnings-model.ts";

export type WalletWinningsProps = Readonly<{
  data: Pick<RewardClaimData, "credits" | "claim">;
  /** A claim to resume once, after returning from the palm scan. */
  resumeCreditId?: string;
  navigate?: (url: string) => void;
  /** Called once the resumed claim starts, so the caller can drop it from the URL. */
  onResumeConsumed?: () => void;
}>;

/** Spec 015 §5.2a: held pool winnings and the verify-to-claim action. */
export function WalletWinnings(props: WalletWinningsProps) {
  const [credits, setCredits] = createSignal<readonly RewardCredit[]>();
  const [failed, setFailed] = createSignal(false);
  const [busy, setBusy] = createSignal<string>();
  const [notice, setNotice] = createSignal("");
  const navigate = (url: string) => (props.navigate ?? ((next: string) => window.location.assign(next)))(url);

  const load = async () => {
    setFailed(false);
    try {
      setCredits((await props.data.credits()).items);
    } catch {
      setFailed(true);
    }
  };

  const claim = async (creditId: string, resumed: boolean) => {
    setBusy(creditId);
    setNotice("");
    try {
      const result = await props.data.claim(creditId);
      setCredits((current) => current?.map((item) => (item.credit_id === creditId ? result.credit : item)));
      const step = claimStep(result.outcome);
      if (step.kind === "verify") {
        if (resumed) {
          setNotice("Your palm scan could not be used to claim yet. Try verifying again.");
          return;
        }
        navigate(verifyToClaimUrl(creditId));
        return;
      }
      if (step.kind === "unavailable") setNotice("This amount cannot be claimed.");
    } catch {
      setNotice("Claiming failed. Try again.");
    } finally {
      setBusy(undefined);
    }
  };

  // Start after the settle callback returns: Solid 2 rejects signal writes
  // made synchronously inside effect callbacks.
  onSettled(() => {
    void Promise.resolve()
      .then(load)
      .then(() => {
        const resume = props.resumeCreditId;
        if (resume === undefined) return;
        props.onResumeConsumed?.();
        return claim(resume, true);
      });
  });

  const views = () => winningViews(credits() ?? []);
  return (
    <Show when={failed() || views().length > 0}>
      <section aria-labelledby="wallet-winnings-heading">
        <Card>
          <CardContent class="flex flex-col gap-4 p-6">
            <Type as="h2" variant="h3" id="wallet-winnings-heading">Winnings</Type>
            <Show when={failed()}>
              <Type role="alert">Your winnings could not be loaded.</Type>
              <Button variant="outline" onClick={() => void load()}>Try again</Button>
            </Show>
            <For each={views()}>
              {(view) => (
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div class="flex flex-col gap-1">
                    <Type class="font-semibold">{view.amount}</Type>
                    <Type>{view.status}</Type>
                    <Show when={view.detail}>{(detail) => <Type class="text-sm">{detail()}</Type>}</Show>
                  </div>
                  <Show when={view.canClaim}>
                    <Button disabled={busy() !== undefined} onClick={() => void claim(view.creditId, false)}>
                      {busy() === view.creditId ? "Claiming…" : "Verify to claim"}
                    </Button>
                  </Show>
                </div>
              )}
            </For>
            <Show when={notice().length > 0}><Type role="status">{notice()}</Type></Show>
          </CardContent>
        </Card>
      </section>
    </Show>
  );
}
