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

export function VendorFaqList({
  items,
  title = "Common questions",
  eyebrow = "FAQ",
}: Props) {
  if (items.length === 0) return null;
  return (
    <div>
      <p
        className="font-label mb-3"
        style={{ color: "#c4541e", letterSpacing: "0.22em" }}
      >
        {eyebrow}
      </p>
      <h2 className="font-editorial italic text-4xl mb-7 text-foreground">
        {title}
      </h2>
      <FaqCardList items={items} />
    </div>
  );
}
