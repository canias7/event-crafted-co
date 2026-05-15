// Static FAQ block on the vendor detail page. Uses native <details>
// for keyboard-accessible disclosure without bringing in radix. Items
// come from a small per-vendor list — passed as a prop so individual
// vendors can override later if we lift this into the schema.

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
      <p className="font-label text-accent mb-4">{eyebrow}</p>
      <h2 className="font-editorial text-4xl mb-6">{title}</h2>
      <div>
        {items.map((f) => (
          <details key={f.q} className="group border-b border-border">
            <summary className="flex items-center justify-between py-5 cursor-pointer text-base font-medium list-none">
              {f.q}
            </summary>
            <p className="pb-5 text-sm text-muted-foreground leading-relaxed max-w-lg">
              {f.a}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}
