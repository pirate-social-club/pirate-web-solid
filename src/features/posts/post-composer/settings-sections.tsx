// Settings step sections (identity, visibility, age gate, access/pricing,
// license, royalty split), ported from the React
// post-composer-settings-sections.tsx.

import { For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";

import {
  Avatar,
  Checkbox,
  CheckboxLabel,
  IconGlobe,
  IconMaskHappy,
  IconUsersThree,
  Input,
  RadioIndicator,
  Type,
} from "../../../design-system";
import { cn } from "../../../design-system";
import { RegionalPricingPreviewDialog } from "./regional-pricing";
import { RoyaltySplitEditor } from "./royalty-split-editor";
import { normalizePriceInput, normalizeRoyaltyInput, normalizeSecondsInput } from "./utils";
import type {
  AssetLicensePresetId,
  AssetRoyaltySplitState,
  AttachmentState,
  AuthorAgeGatePolicy,
  CharityContributionState,
  CommunityCharityPartner,
  RegionalPricingPreview,
} from "./types";

export interface PostComposerSettingsSectionsCopy {
  postAsTitle: string;
  publicIdentityDescription: string;
  anonymousIdentityDescription: string;
  visibilityTitle: string;
  publicVisibilityLabel: string;
  communityVisibilityLabel: string;
  ageGateTitle: string;
  ageGateDescription: string;
  paidUnlockTitle: string;
  priceLabel: string;
  pricePlaceholder: string;
  previewStartLabel: string;
  previewStartPlaceholder: string;
  vinylReleaseUrlLabel: string;
  vinylReleaseUrlPlaceholder: string;
  regionalPricingLabel: string;
  licenseLabel: string;
  licenseLabels: Record<AssetLicensePresetId, string>;
  licenseDescriptions: Record<AssetLicensePresetId, string>;
  royaltyLabel: string;
  royaltyPlaceholder: string;
}

export interface PostComposerSettingsSectionsProps {
  access: "free" | "paid";
  attachment: AttachmentState;
  class?: string;
  copy?: Partial<PostComposerSettingsSectionsCopy>;
  agentIdentityDescription?: string;
  agentIdentityLabel?: string;
  agentIdentitySelected?: boolean;
  anonymousIdentityLabel?: string;
  identity: "pseudonym" | "anonymous";
  ageGatePolicy: AuthorAgeGatePolicy;
  audienceEditingDisabled?: boolean;
  license: AssetLicensePresetId;
  onAgeGatePolicyChange: (value: AuthorAgeGatePolicy) => void;
  onIdentityChange: (value: "pseudonym" | "anonymous") => void;
  onLicenseChange: (value: AssetLicensePresetId) => void;
  onPriceChange: (value: string, nextAccess?: "free" | "paid") => void;
  onPreviewStartSecondsChange?: (value: string) => void;
  onRegionalPricingChange?: (value: boolean) => void;
  onCharityContributionChange?: (updater: (current: CharityContributionState) => CharityContributionState) => void;
  onRoyaltySplitChange?: (value: AssetRoyaltySplitState) => void;
  onRoyaltyPercentChange: (value: string) => void;
  onVinylReleaseUrlChange?: (value: string) => void;
  onVisibilityChange: (value: "public" | "community") => void;
  price: string;
  previewStartSeconds?: string;
  publicAvatarSeed?: string;
  publicAvatarSrc?: string;
  publicIdentityLabel?: string;
  publicIdentityInitials?: string;
  royaltyPercent: string;
  royaltySplit?: AssetRoyaltySplitState;
  charityContribution?: CharityContributionState;
  charityPartner?: CommunityCharityPartner | null;
  regionalPricingAvailable?: boolean;
  regionalPricingEnabled?: boolean;
  regionalPricingPreview?: RegionalPricingPreview | null;
  showLicenseFields?: boolean;
  showRoyaltySplit?: boolean;
  showAnonymousIdentity?: boolean;
  showPostBasics?: boolean;
  visibility: "public" | "community";
  vinylReleaseUrl?: string;
  onAgentIdentitySelect?: () => void;
}

const defaultCopy: PostComposerSettingsSectionsCopy = {
  postAsTitle: "Post as",
  publicIdentityDescription: "Your public profile",
  anonymousIdentityDescription: "Same identity across this community",
  visibilityTitle: "Who can see this?",
  publicVisibilityLabel: "Public",
  communityVisibilityLabel: "Community",
  ageGateTitle: "18+ content",
  ageGateDescription: "Require age verification",
  paidUnlockTitle: "Paid unlock",
  priceLabel: "Price",
  pricePlaceholder: "0",
  previewStartLabel: "30-second preview starts at",
  previewStartPlaceholder: "0",
  vinylReleaseUrlLabel: "ElasticStage vinyl URL",
  vinylReleaseUrlPlaceholder: "https://elasticstage.com/artist/releases/release-singleep",
  regionalPricingLabel: "Use community regional pricing",
  licenseLabel: "License",
  licenseLabels: {
    "non-commercial": "Non-commercial remixing",
    "commercial-use": "Commercial use",
    "commercial-remix": "Commercial remix",
  },
  licenseDescriptions: {
    "non-commercial": "Others can publish non-commercial remixes with attribution; commercial releases are prohibited.",
    "commercial-use": "Others can monetize the original with attribution; derivatives are prohibited.",
    "commercial-remix": "Others can monetize and publish derivatives with attribution.",
  },
  royaltyLabel: "Royalty",
  royaltyPlaceholder: "15",
};

function OptionRow(props: {
  checked: boolean;
  description?: string;
  icon?: JSX.Element;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      class={cn(
        "grid w-full grid-cols-[1fr_auto] items-center gap-4 rounded-[var(--radius-lg)] border p-4 text-start",
        props.icon && "grid-cols-[auto_1fr_auto]",
        props.checked ? "border-primary bg-primary-subtle" : "border-border-soft bg-card",
      )}
      onClick={props.onClick}
      type="button"
    >
      <Show when={props.icon}>
        {(icon) => (
          <span class="grid size-11 place-items-center rounded-full bg-background text-foreground">
            {icon()}
          </span>
        )}
      </Show>
      <span class="min-w-0 space-y-1">
        <Type as="span" variant="body-strong" class="block break-words">
          {props.title}
        </Type>
        <Show when={props.description}>
          <Type as="span" variant="body" class="block text-muted-foreground">
            {props.description}
          </Type>
        </Show>
      </span>
      <RadioIndicator checked={props.checked} />
    </button>
  );
}

export function PostComposerSettingsSections(props: PostComposerSettingsSectionsProps) {
  const copy = (): PostComposerSettingsSectionsCopy => ({
    ...defaultCopy,
    ...props.copy,
    licenseLabels: {
      ...defaultCopy.licenseLabels,
      ...props.copy?.licenseLabels,
    },
    licenseDescriptions: {
      ...defaultCopy.licenseDescriptions,
      ...props.copy?.licenseDescriptions,
    },
  });

  const isLiveAttachment = () => props.attachment?.kind === "live";
  const showAccess = () => Boolean(props.attachment && (
    props.attachment.kind === "song"
    || props.attachment.kind === "video"
    || (isLiveAttachment() && props.access === "paid")
  ));
  const showPaidFields = () => props.access === "paid" && showAccess();
  const shouldShowLicenseFields = () => props.showLicenseFields ?? (showPaidFields() && !isLiveAttachment());
  const canPreviewRegionalPricing = () => Boolean(props.regionalPricingPreview?.tiers.length);
  const agentIdentityDescription = () => props.agentIdentityDescription ?? "Post from your agent identity";
  const anonymousIdentityLabel = () => props.anonymousIdentityLabel ?? "Pseudonym";
  const publicIdentityLabel = () => props.publicIdentityLabel ?? "saint-pablo.pirate";
  const publicIdentityInitials = () => props.publicIdentityInitials ?? "sp";
  const showAnonymousIdentity = () => props.showAnonymousIdentity ?? true;

  return (
    <div class={cn("space-y-8", props.class)}>
      <Show when={props.showPostBasics !== false}>
        <section class="space-y-3">
          <Type as="h2" variant="h3" class="text-muted-foreground">
            {copy().postAsTitle}
          </Type>
          <OptionRow
            checked={props.identity === "pseudonym" && !props.agentIdentitySelected}
            description={copy().publicIdentityDescription}
            icon={
              <Avatar
                class="h-full w-full border-0"
                fallback={publicIdentityInitials()}
                fallbackSeed={props.publicAvatarSeed}
                src={props.publicAvatarSrc}
              />
            }
            onClick={() => props.onIdentityChange("pseudonym")}
            title={publicIdentityLabel()}
          />
          <Show when={showAnonymousIdentity()}>
            <OptionRow
              checked={props.identity === "anonymous" && !props.agentIdentitySelected}
              description={copy().anonymousIdentityDescription}
              icon={<IconMaskHappy class="size-6" />}
              onClick={() => props.onIdentityChange("anonymous")}
              title={anonymousIdentityLabel()}
            />
          </Show>
          <Show when={props.agentIdentityLabel && props.onAgentIdentitySelect}>
            <OptionRow
              checked={props.agentIdentitySelected === true}
              description={agentIdentityDescription()}
              icon={<span class="text-base font-bold">AI</span>}
              onClick={() => props.onAgentIdentitySelect?.()}
              title={props.agentIdentityLabel!}
            />
          </Show>
        </section>

        <section class="space-y-3">
          <Type as="h2" variant="h3" class="text-muted-foreground">
            {copy().visibilityTitle}
          </Type>
          <OptionRow
            checked={props.visibility === "public"}
            icon={<IconGlobe class="size-6" />}
            onClick={() => props.onVisibilityChange("public")}
            title={copy().publicVisibilityLabel}
          />
          <OptionRow
            checked={props.visibility === "community"}
            icon={<IconUsersThree class="size-6" />}
            onClick={() => props.onVisibilityChange("community")}
            title={copy().communityVisibilityLabel}
          />
        </section>

        <section class="space-y-3">
          <div class="flex min-h-14 items-center gap-3 rounded-[var(--radius-lg)] border border-border-soft bg-card px-4 py-3.5">
            <Checkbox
              aria-label={copy().ageGateTitle}
              checked={props.ageGatePolicy === "18_plus"}
              disabled={props.audienceEditingDisabled}
              id="settings-age-gate"
              onChange={(next) => props.onAgeGatePolicyChange(next === true ? "18_plus" : "none")}
            >
              <CheckboxLabel class="flex-1 text-base leading-6">
                <span class="block font-medium text-foreground">{copy().ageGateTitle}</span>
                <span class="block text-muted-foreground">{copy().ageGateDescription}</span>
              </CheckboxLabel>
            </Checkbox>
          </div>
        </section>
      </Show>

      <Show when={showAccess()}>
        <section class="space-y-3">
          <div class="space-y-4 rounded-[var(--radius-lg)] border border-border-soft bg-card p-4">
            <Show when={!isLiveAttachment()}>
              <div class="flex min-h-14 items-center gap-3 rounded-[var(--radius-lg)] border border-border-soft bg-muted/20 px-4 py-3.5">
                <Checkbox
                  aria-label={copy().paidUnlockTitle}
                  checked={props.access === "paid"}
                  id="settings-paid-access"
                  onChange={(next) => props.onPriceChange(props.price, next === true ? "paid" : "free")}
                >
                  <CheckboxLabel class="flex-1 text-base leading-6">
                    {copy().paidUnlockTitle}
                  </CheckboxLabel>
                </Checkbox>
              </div>
            </Show>
            <Show when={showPaidFields()}>
              <div class="space-y-4">
                <label class="block space-y-2">
                  <Type as="span" variant="body-strong">
                    {copy().priceLabel}
                  </Type>
                  <div class="grid grid-cols-[auto_1fr] items-center rounded-[var(--radius-lg)] border border-border-soft bg-background px-4">
                    <span class="text-base font-semibold text-muted-foreground">$</span>
                    <Input
                      class="h-14 rounded-none border-0 bg-transparent px-2 text-end text-lg shadow-none focus-visible:ring-0"
                      inputmode="decimal"
                      onChange={(event) => props.onPriceChange(normalizePriceInput(event.currentTarget.value))}
                      pattern="[0-9]*[.]?[0-9]*"
                      placeholder={copy().pricePlaceholder}
                      value={props.price}
                    />
                  </div>
                </label>
                <Show when={props.attachment?.kind === "song" && props.onPreviewStartSecondsChange}>
                  <label class="block space-y-2">
                    <Type as="span" variant="body-strong">
                      {copy().previewStartLabel}
                    </Type>
                    <div class="grid grid-cols-[1fr_auto] items-center rounded-[var(--radius-lg)] border border-border-soft bg-background px-4">
                      <Input
                        class="h-14 rounded-none border-0 bg-transparent px-0 text-lg shadow-none focus-visible:ring-0"
                        inputmode="numeric"
                        onChange={(event) => props.onPreviewStartSecondsChange?.(normalizeSecondsInput(event.currentTarget.value))}
                        placeholder={copy().previewStartPlaceholder}
                        value={props.previewStartSeconds ?? ""}
                      />
                      <span class="text-base font-semibold text-muted-foreground">s</span>
                    </div>
                  </label>
                </Show>
              </div>
            </Show>
            <Show when={props.attachment?.kind === "song" && props.onVinylReleaseUrlChange}>
              <label class="block space-y-2">
                <Type as="span" variant="body-strong">
                  {copy().vinylReleaseUrlLabel}
                </Type>
                <Input
                  class="h-14 rounded-[var(--radius-lg)] border-border-soft bg-background text-base"
                  inputmode="url"
                  onChange={(event) => props.onVinylReleaseUrlChange?.(event.currentTarget.value)}
                  placeholder={copy().vinylReleaseUrlPlaceholder}
                  value={props.vinylReleaseUrl ?? ""}
                />
              </label>
            </Show>
            <Show when={showPaidFields() && props.regionalPricingAvailable && props.onRegionalPricingChange}>
              <div class="space-y-2">
                <div class="flex min-h-14 items-center gap-3 rounded-[var(--radius-lg)] border border-border-soft bg-muted/20 px-4 py-3.5">
                  <Checkbox
                    aria-label={copy().regionalPricingLabel}
                    checked={props.regionalPricingEnabled}
                    id="settings-regional-pricing"
                    onChange={(next) => props.onRegionalPricingChange?.(next === true)}
                  >
                    <CheckboxLabel class="flex-1 text-base leading-6">
                      {copy().regionalPricingLabel}
                    </CheckboxLabel>
                  </Checkbox>
                </div>
                <Show when={canPreviewRegionalPricing()}>
                  <RegionalPricingPreviewDialog
                    preview={props.regionalPricingPreview}
                    priceUsd={props.price}
                  />
                </Show>
              </div>
            </Show>
          </div>
          <Show when={shouldShowLicenseFields()}>
            <div class="space-y-4 rounded-[var(--radius-lg)] border border-border-soft bg-card p-4">
              <div class="space-y-3">
                <Type as="div" variant="body-strong">
                  {copy().licenseLabel}
                </Type>
                <For each={(["non-commercial", "commercial-use", "commercial-remix"] as const)}>
                  {(preset) => (
                    <OptionRow
                      checked={props.license === preset}
                      description={copy().licenseDescriptions[preset]}
                      onClick={() => props.onLicenseChange(preset)}
                      title={copy().licenseLabels[preset]}
                    />
                  )}
                </For>
              </div>
              <Show when={props.license === "commercial-remix"}>
                <label class="block space-y-2">
                  <Type as="span" variant="body-strong">
                    {copy().royaltyLabel}
                  </Type>
                  <div class="grid grid-cols-[1fr_auto] items-center rounded-[var(--radius-lg)] border border-border-soft bg-background px-4">
                    <Input
                      aria-label={copy().royaltyLabel}
                      class="h-14 rounded-none border-0 bg-transparent px-0 text-lg shadow-none focus-visible:ring-0"
                      inputmode="numeric"
                      max={100}
                      min={0}
                      onChange={(event) => props.onRoyaltyPercentChange(normalizeRoyaltyInput(event.currentTarget.value))}
                      placeholder={copy().royaltyPlaceholder}
                      type="number"
                      value={props.royaltyPercent}
                    />
                    <span class="text-base font-semibold text-muted-foreground">%</span>
                  </div>
                </label>
              </Show>
            </div>
          </Show>
          <Show when={props.showRoyaltySplit && props.royaltySplit && props.onRoyaltySplitChange}>
            <RoyaltySplitEditor
              charityContribution={props.charityContribution}
              charityPartner={props.charityPartner}
              onChange={props.onRoyaltySplitChange!}
              onCharityContributionChange={props.onCharityContributionChange}
              value={props.royaltySplit!}
            />
          </Show>
        </section>
      </Show>
    </div>
  );
}
