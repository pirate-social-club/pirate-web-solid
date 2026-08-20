// Regional pricing preview dialog, ported from the React
// regional-pricing-preview.tsx. Currency formatting and country labels use
// Intl directly (the React version imported app lib helpers); locale comes
// from the UI locale provider like the rest of the app.

import { createSignal, For, Show } from "solid-js";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  IconButton,
  IconX,
} from "../../../design-system";
import { cn } from "../../../design-system";
import { useUiLocale } from "../../../lib/ui-locale";
import { resolveLocaleLanguageTag } from "../../../lib/ui-locale-core";
import type { RegionalPricingPreview, RegionalPricingTierPreview } from "./types";

function parseUsdInput(value: string | null | undefined): number | null {
  const normalized = value?.replace(/[^0-9.]/g, "") ?? "";
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatUsdLabel(value: number | null | undefined, localeTag = "en"): string | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined;
  }
  return Intl.NumberFormat(localeTag, {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function countryCodeToFlag(alpha2: string): string | null {
  const normalized = alpha2.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return null;
  return String.fromCodePoint(
    ...[...normalized].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65),
  );
}

function countryLabel(code: string, localeTag: string): string {
  const normalized = code.trim().toUpperCase();
  let name = normalized;
  try {
    const displayNames = new Intl.DisplayNames([localeTag], { type: "region" });
    name = displayNames.of(normalized) ?? normalized;
  } catch {
    // Unknown region code — fall back to the raw code.
  }
  const flag = countryCodeToFlag(normalized);
  return flag ? `${flag} ${name}` : name;
}

function formatAdjustment(tier: RegionalPricingTierPreview) {
  if (tier.adjustmentType !== "multiplier") return "";
  const percent = Math.round((tier.adjustmentValue - 1) * 100);
  if (percent === 0) return "Base price";
  return percent > 0 ? `+${percent}%` : `${percent}%`;
}

function priceForTier(priceUsd: string, tier: RegionalPricingTierPreview, localeTag: string) {
  const basePrice = parseUsdInput(priceUsd);
  if (basePrice == null) return null;
  return formatUsdLabel(basePrice * tier.adjustmentValue, localeTag) ?? null;
}

function RegionalPricingPreviewBody(props: {
  priceUsd: string;
  preview: RegionalPricingPreview | null | undefined;
}) {
  const locale = useUiLocale;
  const localeTag = () => resolveLocaleLanguageTag(locale());
  const defaultTier = () => props.preview?.tiers.find((tier) => tier.tierKey === props.preview?.defaultTierKey) ?? props.preview?.tiers[0] ?? null;
  const baseLabel = () => formatUsdLabel(parseUsdInput(props.priceUsd), localeTag()) ?? "$0.00";
  const defaultPriceLabel = () => {
    const tier = defaultTier();
    return tier ? priceForTier(props.priceUsd, tier, localeTag()) ?? baseLabel() : baseLabel();
  };

  return (
    <div class="space-y-5">
      <div class="flex items-center gap-4 text-base">
        <div class="flex items-center gap-1.5">
          <span class="text-muted-foreground">Base price</span>
          <span class="font-medium">{baseLabel()}</span>
        </div>
        <span class="text-border-soft">·</span>
        <div class="flex items-center gap-1.5">
          <span class="text-muted-foreground">Default</span>
          <span class="font-medium">{defaultPriceLabel()}</span>
        </div>
      </div>

      <div class="space-y-4">
        <For each={props.preview?.tiers ?? []}>
          {(tier) => {
            const tierPrice = () => priceForTier(props.priceUsd, tier, localeTag());
            const isDefault = () => tier.tierKey === props.preview?.defaultTierKey;
            return (
              <div class="border-b border-border-soft pb-4 last:border-0 last:pb-0">
                <div class="mb-2 flex items-center gap-2 text-base">
                  <span class="font-medium">{tier.displayName || tier.tierKey}</span>
                  <span class="text-muted-foreground">{formatAdjustment(tier)}</span>
                  <Show when={isDefault()}>
                    <span class="text-muted-foreground">· Default</span>
                  </Show>
                  <Show when={tierPrice()}>
                    <span class="ml-auto font-medium">{tierPrice()}</span>
                  </Show>
                </div>
                <div class="flex flex-wrap gap-x-3 gap-y-1 text-base text-muted-foreground">
                  <For each={tier.countryCodes}>
                    {(code) => (
                      <span class="whitespace-nowrap">
                        {countryLabel(code, localeTag())}
                      </span>
                    )}
                  </For>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}

export function RegionalPricingPreviewDialog(props: {
  priceUsd: string;
  preview: RegionalPricingPreview | null | undefined;
}) {
  const [open, setOpen] = createSignal(false);

  return (
    <Dialog onOpenChange={setOpen} open={open()}>
      <DialogTrigger
        class="w-fit text-base font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        type="button"
      >
        View Regional Pricing
      </DialogTrigger>
      <DialogContent
        class={cn(
          "flex max-h-[min(82vh,760px)] w-[min(100%-2rem,52rem)] grid-rows-none flex-col overflow-hidden p-0",
          "max-sm:inset-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-screen max-sm:rounded-none max-sm:border-0",
        )}
        hideCloseButton
      >
        <IconButton
          aria-label="Close regional pricing"
          class="absolute left-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-10 sm:top-4"
          onClick={() => setOpen(false)}
          variant="ghost"
        >
          <IconX class="size-5" />
        </IconButton>
        <div class="shrink-0 border-b border-border-soft px-6 pt-[calc(env(safe-area-inset-top)+3rem)] pb-5 sm:pt-14 max-sm:px-4">
          <DialogHeader class="text-start">
            <DialogTitle>Regional Pricing</DialogTitle>
            <DialogDescription>
              Based on verified Self.xyz nationality. Unverified buyers pay the default.
            </DialogDescription>
          </DialogHeader>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5 max-sm:px-4">
          <div class="space-y-4">
            <RegionalPricingPreviewBody priceUsd={props.priceUsd} preview={props.preview} />
            <DialogFooter class="max-sm:hidden">
              <Button onClick={() => setOpen(false)}>Close preview</Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
