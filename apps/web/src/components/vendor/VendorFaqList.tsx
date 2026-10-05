import { useTranslation } from "react-i18next";
import { FaqCardList } from "@/components/vendor/VendorFaqsManager";

// Static FAQ block on the vendor detail page. Renders the same
// editorial-card disclosure as the dynamic public list — the only
// difference is where the items come from.

interface FaqItem {
  q: string;
  a: string;
}

interface Props {
  items: FaqItem[];
  title?: string;
  eyebrow?: string;
}

export function VendorFaqList({ items, title, eyebrow }: Props) {
  const { t } = useTranslation("vendorProfile");
  if (items.length === 0) return null;
  return (
    <div>
      <p
        className="font-label mb-3"
        style={{ color: "#14161a", letterSpacing: "0.22em" }}
      >
        {eyebrow ?? t("faq.eyebrow")}
      </p>
      <h2 className="font-editorial text-4xl mb-7 text-foreground">
        {title ?? t("faq.title")}
      </h2>
      <FaqCardList items={items} />
    </div>
  );
}
