// Settings step hub wiring the controller to the settings sections, ported
// from the React post-composer-settings-hub.tsx.

import { CardContent } from "../../../design-system";
import { cn } from "../../../design-system";
import type { PostComposerController } from "./controller";
import { shouldForcePublicIdentityForTab } from "./invariants";
import { PostComposerSettingsSections } from "./settings-sections";
import type { AssetLicensePresetId, AttachmentState } from "./types";

function attachmentFromTab(controller: PostComposerController): AttachmentState {
  const { fields, media, tabs } = controller;

  if (tabs.activeTab === "link") {
    return { kind: "link", url: fields.linkUrlValue };
  }
  if (tabs.activeTab === "image") {
    return {
      kind: "image",
      label: media.activeImageUpload?.name ?? media.imageUploadLabel ?? "Image",
    };
  }
  if (tabs.activeTab === "video") {
    return {
      kind: "video",
      label: media.videoState.primaryVideoLabel ?? media.videoState.primaryVideoUpload?.name ?? "Video",
    };
  }
  if (tabs.activeTab === "song") {
    return {
      kind: "song",
      label: controller.song.state.primaryAudioLabel ?? controller.song.state.primaryAudioUpload?.name ?? "Song",
    };
  }
  if (tabs.activeTab === "live") {
    return { kind: "live" };
  }
  return null;
}

function accessFromController(controller: PostComposerController): "free" | "paid" {
  if (controller.tabs.activeTab === "live") {
    return controller.primary.liveState.accessMode === "paid" ? "paid" : "free";
  }
  return controller.commerce.monetizationState.visible ? "paid" : "free";
}

function licenseCopyForPreset(
  licenseCopy: Record<string, string> | null,
  preset: AssetLicensePresetId,
) {
  return {
    label: licenseCopy?.[preset] ?? preset,
    description: licenseCopy?.[`${preset}Description`] ?? "",
  };
}

function settingsCopy(controller: PostComposerController) {
  const { copy, identity, license, tabs } = controller;
  const assetLicenseCopy = license.assetLicenseCopy;
  const nonCommercial = licenseCopyForPreset(assetLicenseCopy, "non-commercial");
  const commercialUse = licenseCopyForPreset(assetLicenseCopy, "commercial-use");
  const commercialRemix = licenseCopyForPreset(assetLicenseCopy, "commercial-remix");
  const paidUnlockTitle = tabs.activeTab === "song"
    ? copy.access.payToAccess
    : copy.access.paidUnlock;
  const priceLabel = tabs.activeTab === "live"
    ? "Ticket price"
    : copy.fields.price ?? copy.fields.unlockPriceUsd;

  return {
    postAsTitle: copy.sections.postAs,
    publicIdentityDescription: "Your public profile",
    anonymousIdentityDescription: identity.identity?.anonymousDescription ?? "Same identity across this community",
    visibilityTitle: "Who can see this?",
    publicVisibilityLabel: copy.audience.public,
    communityVisibilityLabel: copy.audience.community,
    ageGateTitle: "18+ content",
    ageGateDescription: "Require age verification",
    paidUnlockTitle,
    priceLabel,
    pricePlaceholder: copy.placeholders.unlockPrice,
    regionalPricingLabel: copy.access.useRegionalPricing,
    licenseLabel: tabs.activeTab === "song" && controller.primary.activeSongMode === "remix"
      ? copy.derivative.licenseNewRemixTerms
      : copy.sections.license,
    licenseLabels: {
      "non-commercial": nonCommercial.label,
      "commercial-use": commercialUse.label,
      "commercial-remix": commercialRemix.label,
    },
    licenseDescriptions: {
      "non-commercial": nonCommercial.description,
      "commercial-use": commercialUse.description,
      "commercial-remix": commercialRemix.description,
    },
    royaltyLabel: assetLicenseCopy?.revenueShare ?? "Royalty",
    royaltyPlaceholder: String(
      tabs.activeTab === "song"
        ? controller.license.state.commercialRevSharePct ?? 10
        : controller.license.state.commercialRevSharePct ?? 15,
    ),
  };
}

function publicInitials(handle: string) {
  const trimmed = handle.replace(/^@/, "").trim();
  if (!trimmed) return "me";
  const chunks = trimmed.split(/[-.\s_]+/).filter(Boolean);
  if (chunks.length === 1) return chunks[0]!.slice(0, 2).toLowerCase();
  return `${chunks[0]![0] ?? ""}${chunks[1]![0] ?? ""}`.toLowerCase();
}

export function PostComposerSettingsHub(props: {
  controller: PostComposerController;
}) {
  const controller = props.controller;
  const attachment = () => attachmentFromTab(controller);
  const publicHandle = () => controller.identity.identity?.publicHandle ?? "name.pirate";
  const anonymousLabel = () => controller.identity.identity?.anonymousLabel ?? "Pseudonym";
  const showAnonymousIdentity = () => controller.identity.identity?.allowAnonymousIdentity === true
    && !shouldForcePublicIdentityForTab({
      activeTab: controller.tabs.activeTab,
      identityMode: "anonymous",
      monetizationVisible: controller.commerce.monetizationState.visible,
    });

  return (
    <CardContent class={cn("space-y-8 p-5", controller.isMobile() && "px-0 pb-4 pt-1")}>
      <PostComposerSettingsSections
        access={accessFromController(controller)}
        agentIdentityDescription="Post from your agent identity"
        agentIdentityLabel={controller.identity.identity?.agentLabel}
        agentIdentitySelected={controller.identity.authorMode === "agent"}
        anonymousIdentityLabel={anonymousLabel()}
        attachment={attachment()}
        copy={settingsCopy(controller)}
        identity={controller.identity.identityMode === "anonymous" ? "anonymous" : "pseudonym"}
        ageGatePolicy={controller.audience.ageGatePolicy}
        license={controller.license.state.presetId}
        onAgeGatePolicyChange={controller.audience.setAgeGatePolicy}
        onAgentIdentitySelect={() => controller.identity.setAuthorMode("agent")}
        onIdentityChange={(nextIdentity) => {
          controller.identity.setAuthorMode("human");
          controller.identity.setIdentityMode(nextIdentity === "anonymous" ? "anonymous" : "public");
        }}
        onLicenseChange={(presetId) =>
          controller.license.update((current) => ({
            presetId,
            commercialRevSharePct: presetId === "commercial-remix"
              ? current.commercialRevSharePct ?? 10
              : undefined,
          }))
        }
        onPriceChange={(priceUsd, nextAccess) => {
          controller.commerce.updateMonetizationState((current) => ({
            ...current,
            priceUsd,
            regionalPricingEnabled: nextAccess === "free" ? false : current.regionalPricingEnabled,
            visible: nextAccess === undefined ? current.visible : nextAccess === "paid",
          }));
          if (controller.tabs.activeTab === "live" && nextAccess !== undefined) {
            controller.primary.setLiveState({
              ...controller.primary.liveState,
              accessMode: nextAccess === "paid" ? "paid" : "free",
            });
          }
        }}
        onRegionalPricingChange={(regionalPricingEnabled) =>
          controller.commerce.updateMonetizationState((current) => ({
            ...current,
            regionalPricingEnabled,
          }))
        }
        onRoyaltyPercentChange={(value) =>
          controller.license.update((current) => ({
            ...current,
            commercialRevSharePct: value.trim() ? Number.parseInt(value, 10) : undefined,
          }))
        }
        onRoyaltySplitChange={(next) => controller.royaltySplit.update(() => next)}
        onCharityContributionChange={controller.charity.update}
        onVisibilityChange={(nextVisibility) =>
          controller.audience.update((current) => ({
            ...current,
            visibility: nextVisibility === "community" ? "members_only" : "public",
          }))
        }
        price={controller.commerce.monetizationState.priceUsd ?? ""}
        publicAvatarSrc={controller.identity.publicAvatarSrc ?? undefined}
        publicAvatarSeed={controller.identity.publicAvatarSeed ?? undefined}
        publicIdentityInitials={publicInitials(publicHandle())}
        publicIdentityLabel={publicHandle()}
        regionalPricingAvailable={controller.commerce.monetizationState.regionalPricingAvailable}
        regionalPricingEnabled={controller.commerce.monetizationState.regionalPricingEnabled}
        regionalPricingPreview={controller.commerce.regionalPricingPreview}
        charityContribution={controller.charity.state}
        charityPartner={
          (attachment()?.kind === "song" || attachment()?.kind === "video")
          && controller.commerce.monetizationState.visible
            ? controller.charity.partner
            : null
        }
        royaltyPercent={String(controller.license.state.commercialRevSharePct ?? 10)}
        royaltySplit={controller.royaltySplit.state}
        showLicenseFields={
          attachment()?.kind === "live"
            ? false
            : attachment()?.kind === "video"
              ? controller.commerce.monetizationState.visible
              : attachment()?.kind === "song"
        }
        showRoyaltySplit={
          attachment()?.kind === "song"
          || (attachment()?.kind === "video" && controller.commerce.monetizationState.visible)
        }
        showAnonymousIdentity={showAnonymousIdentity()}
        showPostBasics={false}
        visibility={controller.audience.state.visibility === "members_only" ? "community" : "public"}
      />
    </CardContent>
  );
}
