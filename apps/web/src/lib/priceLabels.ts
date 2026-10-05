import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { PRICING_MODEL_LABELS, EVENT_TYPE_LABELS } from "@vendora/core";
import i18n from "@/i18n";

// Website versions of @vendora/core's formatListingPrice,
// pricingModelsLabel and eventTypeLabel, in the visitor's language
// (locales/<language>/pricing.json). The core versions stay English for
// the mobile apps. Same output as core in English.

type T = TFunction;

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function listingPrice(t: T, minCents?: number | null, maxCents?: number | null): string {
  const hasMin = minCents != null && minCents > 0;
  const hasMax = maxCents != null && maxCents > 0;
  if (hasMin && hasMax) {
    return minCents === maxCents
      ? dollars(minCents as number)
      : `${dollars(minCents as number)} – ${dollars(maxCents as number)}`;
  }
  if (hasMin) return t("from", { price: dollars(minCents as number) });
  if (hasMax) return t("upTo", { price: dollars(maxCents as number) });
  return t("custom");
}

function pricingModels(t: T, models?: string[] | null): string {
  if (!models || models.length === 0) return "";
  return models
    .map((m) => (m in PRICING_MODEL_LABELS ? t(`models.${m}`) : m))
    .join(" · ");
}

function eventType(t: T, type?: string | null, fallback?: string): string {
  const v = type?.trim();
  if (!v) return fallback ?? t("eventTypes.fallback");
  if (v in EVENT_TYPE_LABELS) return t(`eventTypes.${v}`);
  return v
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** For components: labels that update when the language changes. */
export function usePriceLabels() {
  const { t } = useTranslation("pricing");
  return {
    /** "From $500", "$500 – $2,000", "Up to $2,000" or "Custom pricing". */
    listingPrice: (minCents?: number | null, maxCents?: number | null) => listingPrice(t, minCents, maxCents),
    /** "Fixed Packages · Per Person". */
    pricingModels: (models?: string[] | null) => pricingModels(t, models),
    /** "Holiday Dinner" for an inquiry's event type. */
    eventType: (type?: string | null, fallback?: string) => eventType(t, type, fallback),
  };
}

/** Outside components: the same labels in the current language. */
const fixedT = () => i18n.getFixedT(null, "pricing");
export const listingPriceLabel = (minCents?: number | null, maxCents?: number | null) =>
  listingPrice(fixedT(), minCents, maxCents);
export const pricingModelsText = (models?: string[] | null) => pricingModels(fixedT(), models);
export const eventTypeText = (type?: string | null, fallback?: string) => eventType(fixedT(), type, fallback);
