import {
  Card,
  IconCheckCircle,
  IconGlobe,
  Type,
  buttonVariants,
} from "@pirate/web-solid-ui";
import type { ConnectedCommunityName } from "./owner-settings-model";

export interface CommunityNamespaceSettingsPanelProps {
  connectedName: ConnectedCommunityName;
}

export function CommunityNamespaceSettingsPanel(props: CommunityNamespaceSettingsPanelProps) {
  return (
    <section class="mx-auto flex w-full max-w-5xl flex-col gap-6 md:gap-8" data-community-namespace-settings>
      <div class="space-y-2">
        <Type as="h2" responsiveSize="desktop4xl" variant="h1">Community address</Type>
        <Type as="p" class="max-w-2xl text-muted-foreground" variant="body">The name people can use to open this community.</Type>
      </div>

      <Card class="flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between md:p-6">
        <div class="flex min-w-0 items-start gap-4">
          <div class="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted">
            <IconGlobe class="size-5" />
          </div>
          <div class="min-w-0 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <Type as="h3" class="break-all" variant="h3">{props.connectedName.label}</Type>
              <span class="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-xs font-semibold text-success">
                <IconCheckCircle class="size-3.5" />
                Connected
              </span>
            </div>
            <Type as="p" class="text-muted-foreground" variant="body">{props.connectedName.providerLabel}</Type>
          </div>
        </div>
        <a class={buttonVariants({ variant: "secondary" })} href={props.connectedName.address} rel="noreferrer" target="_blank">
          Open name
        </a>
      </Card>
    </section>
  );
}
