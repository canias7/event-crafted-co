import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { FaqItem } from "@/data/categoryFaqs";

// Renders an accordion FAQ block. Only one item open at a time keeps the
// page from getting unwieldy and matches how Google renders FAQ rich
// results in SERPs.
export function FaqSection({
  items,
  title = "Frequently asked",
  eyebrow = "FAQ",
}: {
  items: FaqItem[];
  title?: string;
  eyebrow?: string;
}) {
  const [open, setOpen] = useState<number | null>(0);

  if (items.length === 0) return null;

  return (
    <section className="py-16 md:py-20 border-t border-border">
      <div className="container mx-auto px-6 md:px-8 max-w-3xl">
        <p className="font-label text-accent mb-3 tracking-[0.4em]">
          — {eyebrow}
        </p>
        <h2 className="font-editorial text-4xl md:text-4xl mb-10 leading-tight">
          {title}
        </h2>
        <div className="space-y-2">
          {items.map((item, i) => {
            const isOpen = open === i;
            return (
              <div
                key={i}
                className="border-b border-border last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 py-5 text-left group"
                  aria-expanded={isOpen}
                >
                  <span className="font-display text-lg leading-snug">
                    {item.q}
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 text-muted-foreground transition-transform shrink-0 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <div
                  className={`grid transition-all duration-300 ${
                    isOpen ? "grid-rows-[1fr] pb-6" : "grid-rows-[0fr]"
                  }`}
                >
                  <p className="overflow-hidden text-foreground/75 leading-relaxed">
                    {item.a}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
