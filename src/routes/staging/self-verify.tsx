import { Title } from "@solidjs/meta";
import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, FormNote, TextField, TextFieldInput, TextFieldLabel, Type } from "../../design-system";
import { fetchVerificationConfig } from "../../api/verification-config.ts";
import {
  PrivyIdentityBootstrapRequired,
  createPrivySessionExchange,
} from "../../api/privy-session.ts";
import { resolveSession } from "../../api/session.ts";
import { createSessionApiClient } from "../../api/client.ts";
import { createSelfLaunch, type SelfLaunchPresentation } from "../../api/self-launch.ts";

type Phase =
  | "loading"
  | "unavailable"
  | "signin-email"
  | "signin-code"
  | "ready"
  | "launching"
  | "present"
  | "verified";

const POLL_INTERVAL_MS = 5_000;

/** Renders the Self universal link as a canvas QR; no image CSP change needed. */
function QrCanvas(props: { readonly value: string }) {
  let canvas: HTMLCanvasElement | undefined;
  createEffect(() => {
    const value = props.value;
    if (canvas === undefined) return;
    void import("qrcode").then(qr => qr.toCanvas(canvas, value, { width: 280, margin: 1 }));
  });
  return <canvas ref={canvas} aria-label="Self verification QR code" role="img" />;
}

export default function StagingSelfVerifyRoute() {
  const [phase, setPhase] = createSignal<Phase>("loading");
  const [email, setEmail] = createSignal("");
  const [code, setCode] = createSignal("");
  const [message, setMessage] = createSignal("");
  const [launch, setLaunch] = createSignal<SelfLaunchPresentation>();
  let verificationConfig: Awaited<ReturnType<typeof fetchVerificationConfig>> | undefined;
  let auth: Awaited<ReturnType<typeof createPrivySessionExchange>> | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let mounted = true;

  onCleanup(() => {
    mounted = false;
    if (pollTimer !== undefined) clearInterval(pollTimer);
  });

  const beginPolling = (expiresAt: string) => {
    if (pollTimer !== undefined) clearInterval(pollTimer);
    const client = createSessionApiClient();
    const deadline = Date.parse(expiresAt);
    pollTimer = setInterval(() => {
      void client.get_usersMe(undefined).then(
        me => {
          const state = me.verification_capabilities?.age_over_18?.state;
          if (state === "verified" && mounted) {
            if (pollTimer !== undefined) clearInterval(pollTimer);
            setPhase("verified");
          } else if (Number.isFinite(deadline) && Date.now() > deadline) {
            if (pollTimer !== undefined) clearInterval(pollTimer);
            if (mounted) setMessage("The session expired; start a fresh one.");
          }
        },
        () => undefined,
      );
    }, POLL_INTERVAL_MS);
  };

  createEffect(
    () => true,
    () => {
      if (typeof window === "undefined") return;
      void (async () => {
        try {
          verificationConfig = await fetchVerificationConfig();
          const session = await resolveSession();
          if (!mounted) return;
          setPhase(session === "authenticated" ? "ready" : "signin-email");
        } catch {
          if (mounted) setPhase("unavailable");
        }
      })();
    },
  );

  const signIn = async () => {
    if (verificationConfig === undefined) return;
    auth ??= await createPrivySessionExchange(verificationConfig);
    setMessage("");
    try {
      if (phase() === "signin-email") {
        await auth.sendCode(email());
        setPhase("signin-code");
      } else {
        await auth.loginWithCode(email(), code());
        if (mounted) setPhase("ready");
      }
    } catch (error) {
      if (mounted) {
        setMessage(
          error instanceof PrivyIdentityBootstrapRequired
            ? "This account needs identity bootstrap first."
            : "Sign-in failed. Check the email and code.",
        );
      }
    }
  };

  const start = async () => {
    setPhase("launching");
    setMessage("");
    try {
      const presentation = await createSelfLaunch().start();
      if (!mounted) return;
      setLaunch(presentation);
      setPhase("present");
      beginPolling(presentation.expiresAt);
    } catch {
      if (mounted) {
        setMessage("Could not start the verification session. Try again.");
        setPhase("ready");
      }
    }
  };

  return (
    <main data-route-path="/staging/self-verify" class="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
      <Title>Staging Self document verification</Title>
      <Type as="h1" variant="h1">Self document verification (staging)</Type>
      <Type as="p" class="text-muted-foreground" variant="caption">
        Staging harness for the real-document Self ceremony. The QR below is scanned with the Self
        app; no mock passport is used.
      </Type>

      <Show when={phase() === "loading"}>
        <FormNote>Loading the staging verification configuration…</FormNote>
      </Show>
      <Show when={phase() === "unavailable"}>
        <FormNote tone="warning">The staging verification harness is not enabled in this environment.</FormNote>
      </Show>

      <Show when={phase() === "signin-email" || phase() === "signin-code"}>
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Use the staging test email and one-time code.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <Show when={phase() === "signin-email"}>
              <TextField name="email" value={email()} onChange={setEmail}>
                <TextFieldLabel>Email</TextFieldLabel>
                <TextFieldInput />
              </TextField>
            </Show>
            <Show when={phase() === "signin-code"}>
              <TextField name="code" value={code()} onChange={setCode}>
                <TextFieldLabel>One-time code</TextFieldLabel>
                <TextFieldInput />
              </TextField>
            </Show>
            <Button type="button" onClick={() => void signIn()}>
              {phase() === "signin-email" ? "Send login code" : "Sign in"}
            </Button>
          </CardContent>
        </Card>
      </Show>

      <Show when={phase() === "ready" || phase() === "launching"}>
        <Button type="button" loading={phase() === "launching"} onClick={() => void start()}>
          Start document verification
        </Button>
      </Show>

      <Show when={phase() === "present" && launch() !== undefined}>
        <Card>
          <CardHeader>
            <CardTitle>Scan with the Self app</CardTitle>
            <CardDescription>Session {launch()?.sessionId}; expires {launch()?.expiresAt}.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <QrCanvas value={launch()?.href ?? ""} />
            <Type as="p" variant="caption" class="break-all">{launch()?.href}</Type>
          </CardContent>
        </Card>
      </Show>

      <Show when={phase() === "verified"}>
        <FormNote>Verification completed. The staging evidence is recorded server-side.</FormNote>
      </Show>

      <Show when={message() !== ""}>
        <div aria-live="assertive" role="alert"><FormNote tone="warning">{message()}</FormNote></div>
      </Show>
    </main>
  );
}
