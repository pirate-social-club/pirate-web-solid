import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { Button, Input } from "../../../design-system.ts";
import { createSpacesTaprootWalletSession, type SpacesTaprootWalletSession } from "../../../api/spaces-taproot-wallet-session.ts";

export type SpacesWalletSetupScope = Readonly<{
  accountId: string;
  selectedPersonaId: string;
  recipientPersonaId: string;
  communityId: string;
  activationId: string;
  activationGeneration: number;
  namespaceRoot: string;
  offeringId: string;
  offeringRevision: number;
  offeringHash: string;
  sessionGeneration: number;
}>;

const scopeKey = (scope: SpacesWalletSetupScope | undefined) => scope === undefined ? undefined : JSON.stringify(scope);

/** Only this mounted account/profile/offering may continue its memory-only authorization. */
export function SpacesWalletSetup(props: {
  readonly scope: () => SpacesWalletSetupScope | undefined;
  readonly readCsrf: () => string | undefined;
  readonly onMessage: (kind: "verification" | "error", message: string) => void;
  readonly onReady: () => void;
  readonly onBusyChange: (busy: boolean) => void;
  readonly createSession?: () => Promise<SpacesTaprootWalletSession>;
}) {
  const [email, setEmail] = createSignal("", { ownedWrite: true });
  const [code, setCode] = createSignal("", { ownedWrite: true });
  const [step, setStep] = createSignal<"idle" | "sending" | "code" | "working">("idle", { ownedWrite: true });
  let session: SpacesTaprootWalletSession | undefined;
  let disposed = false;
  let generation = 0;
  const clearSession = () => { session?.dispose(); session = undefined; };
  createEffect(() => scopeKey(props.scope()), () => {
    generation++;
    clearSession();
    setEmail(""); setCode(""); setStep("idle");
    props.onBusyChange(false);
  });
  onCleanup(() => { disposed = true; generation++; clearSession(); props.onBusyChange(false); });
  const capture = () => {
    const scope = props.scope();
    if (scope === undefined || disposed) return undefined;
    const key = scopeKey(scope), capturedGeneration = generation;
    return { scope, current: () => !disposed && generation === capturedGeneration && scopeKey(props.scope()) === key };
  };

  const begin = async () => {
    const address = email().trim();
    const captured = capture();
    if (captured === undefined || address === "" || step() !== "idle") return;
    setStep("sending"); props.onBusyChange(true);
    let created: SpacesTaprootWalletSession | undefined;
    try {
      clearSession();
      created = await (props.createSession ?? createSpacesTaprootWalletSession)();
      if (!captured.current()) { created.dispose(); return; }
      session = created;
      await created.sendCode(address);
      if (!captured.current()) { created.dispose(); return; }
      setStep("code");
      props.onMessage("verification", "Enter the code sent to your email to set up the receiving wallet.");
    } catch {
      created?.dispose();
      if (!captured.current()) return;
      session = undefined; setStep("idle");
      props.onMessage("error", "Wallet authorization is unavailable. Try again later.");
    } finally {
      if (captured.current()) props.onBusyChange(false);
    }
  };

  const complete = async () => {
    const ownedSession = session, captured = capture(), csrf = props.readCsrf();
    const address = email().trim(), enteredCode = code().trim();
    if (ownedSession === undefined || captured === undefined || csrf === undefined || enteredCode === "" || step() !== "code") return;
    setStep("working"); props.onBusyChange(true);
    try {
      await ownedSession.loginWithCode(address, enteredCode);
      if (!captured.current()) return;
      const result = await ownedSession.setup(captured.scope.recipientPersonaId, csrf);
      if (!captured.current()) return;
      if (result.kind === "active") {
        props.onMessage("verification", "Receiving wallet ready. Your original request is retained. Check your Spaces name requests before continuing.");
        props.onReady();
      } else if (result.kind === "ambiguous") {
        props.onMessage("error", "Wallet setup needs review. No additional wallet will be created automatically.");
      } else {
        props.onMessage("verification", "Wallet setup is pending. Check again later; no additional wallet will be created automatically.");
      }
    } catch {
      if (captured.current()) props.onMessage("error", "Wallet setup could not be confirmed. Try again later; the service will check the existing attempt before creating anything.");
    } finally {
      ownedSession.dispose();
      if (session === ownedSession) session = undefined;
      if (captured.current()) { setCode(""); setStep("idle"); props.onBusyChange(false); }
    }
  };

  return <div class="rounded-xl border border-border-soft p-4" data-spaces-wallet-setup>
    <p class="font-semibold">Set up a receiving wallet</p>
    <p class="text-sm text-muted-foreground">Confirm your account by email. This does not send bitcoin.</p>
    <label class="mt-3 block text-sm" for="spaces-wallet-email">Account email</label>
    <Input id="spaces-wallet-email" type="email" autocomplete="email" value={email()}
      disabled={props.scope() === undefined || step() !== "idle"} onInput={event => setEmail(event.currentTarget.value)} />
    <Show when={step() === "code" || step() === "working"}>
      <label class="mt-3 block text-sm" for="spaces-wallet-code">Email code</label>
      <Input id="spaces-wallet-code" type="text" inputmode="numeric" autocomplete="one-time-code"
        value={code()} disabled={props.scope() === undefined || step() === "working"}
        onInput={event => setCode(event.currentTarget.value)} />
    </Show>
    <Button class="mt-3" disabled={props.scope() === undefined || step() === "sending" || step() === "working"}
      onClick={() => void (step() === "code" ? complete() : begin())}>
      {step() === "code" ? "Confirm wallet" : step() === "working" ? "Checking wallet" : "Send code"}
    </Button>
  </div>;
}
