// Listing price lines in the app's language: same rules as
// @vendora/core's formatListingPrice / pricingModelsLabel (which are
// English only). Money keeps the US format ($1,234) in every language.
// Strings live in the `vendorDetail` namespace (price.*, pricingModels.*).
import { useT } from "@/lib/i18n";

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

export function usePriceLabels() {
  const { t } = useT("vendorDetail");
  return {
    /** "$500 – $2,000", "From $500", "Up to $2,000" or "Custom pricing". */
    listingPrice(minCents?: number | null, maxCents?: number | null): string {
      const hasMin = minCents != null && minCents > 0;
      const hasMax = maxCents != null && maxCents > 0;
      if (hasMin && hasMax) {
        return minCents === maxCents
          ? dollars(minCents as number)
          : `${dollars(minCents as number)} – ${dollars(maxCents as number)}`;
      }
      if (hasMin) return t("price.from", { amount: dollars(minCents as number) });
      if (hasMax) return t("price.upTo", { amount: dollars(maxCents as number) });
      return t("price.custom");
    },
    /** "Hourly · Per Person"; unknown stored values show as stored. */
    models(models?: string[] | null): string {
      if (!models || models.length === 0) return "";
      return models
        .map((m) => {
          const label = t(`pricingModels.${m}`);
          return label === `vendorDetail.pricingModels.${m}` ? m : label;
        })
        .join(" · ");
    },
  };
}
