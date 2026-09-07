import { Title } from "@solidjs/meta";

import { Card, CardContent } from "../../design-system";
import { SignInPanel } from "../../features/auth/sign-in-panel.tsx";

export function signInReturnPath(href: string): string {
  const intentId = new URL(href).searchParams.get("community_intent");
  return intentId && /^[a-zA-Z0-9_-]{1,200}$/.test(intentId)
    ? `/communities/new?intent_id=${encodeURIComponent(intentId)}` : "/";
}

export default function SignInRoute() {
  return (
    <main data-route-path="/auth/sign-in" class="mx-auto flex min-h-screen w-full max-w-xl items-center px-5 py-10">
      <Title>Join Pirate</Title>
      <Card class="w-full">
        <CardContent class="p-6 md:p-8">
          <SignInPanel onAuthenticated={() => window.location.assign(signInReturnPath(window.location.href))} />
        </CardContent>
      </Card>
    </main>
  );
}
