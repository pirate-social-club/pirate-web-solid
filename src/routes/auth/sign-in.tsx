import { Title } from "@solidjs/meta";

import { Card, CardContent, Type } from "../../design-system";
import { SignInPanel } from "../../features/auth/sign-in-panel.tsx";

export default function SignInRoute() {
  return (
    <main data-route-path="/auth/sign-in" class="mx-auto flex min-h-screen w-full max-w-xl items-center px-5 py-10">
      <Title>Sign in · Pirate</Title>
      <Card class="w-full">
        <CardContent class="flex flex-col gap-6 p-6 md:p-8">
          <div>
            <Type as="h1" variant="h1">Welcome to Pirate</Type>
            <Type as="p" variant="body" class="mt-2 text-muted-foreground">Sign in with an identity method to follow communities, save posts, and publish.</Type>
          </div>
          <SignInPanel onAuthenticated={() => window.location.assign("/")} />
        </CardContent>
      </Card>
    </main>
  );
}
