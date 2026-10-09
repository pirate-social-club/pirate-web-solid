import { Button, Card, Type } from "@pirate/web-solid-ui";
import { onCleanup } from "solid-js";
import { requestGlobalSignInCompletion } from "../../auth/global-sign-in-host";

export function OwnerSettingsSignInCard(props: { onAuthenticated?: () => void } = {}) {
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  const signIn = async () => {
    if (await requestGlobalSignInCompletion(controller.signal)) {
      if (props.onAuthenticated !== undefined) props.onAuthenticated();
      else window.location.reload();
    }
  };
  return (
    <Card class="p-6" data-owner-settings-sign-in>
      <Type as="h2" variant="h2">Sign in required</Type>
      <Type as="p" class="mt-2 text-muted-foreground" variant="body">
        Sign in to manage this community's settings.
      </Type>
      <Button class="mt-4" onClick={() => void signIn()}>Sign in</Button>
    </Card>
  );
}
