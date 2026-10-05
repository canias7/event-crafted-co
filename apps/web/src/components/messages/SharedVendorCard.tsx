import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Store, ArrowUpRight } from "lucide-react";
import type { VendorCardAttachment } from "@/lib/messageAttachments";
import { useCategoryNames } from "@/lib/categoryNames";

// A vendor profile shared into a conversation — the "introduction" surface.
// A host viewing a chat with Vendor A can send Vendor B's profile; it renders
// here as a tappable card in the thread.
//
// Deliberately just a link to the vendor's public profile: tapping does NOT
// create a conversation. Starting a vendor-to-vendor thread stays the
// recipient's own action from that profile, which keeps the Pro-tier gate on
// find_or_create_partner_thread intact and means a host can't drop
// unrequested threads into a vendor's inbox.
//
// Display fields come from the snapshot stored on the attachment, so the card
// still reads correctly if the vendor later renames or unpublishes.
export function SharedVendorCard({ card }: { card: VendorCardAttachment }) {
  const { t } = useTranslation("messages");
  const categoryNames = useCategoryNames();
  // The category is the English name stored on the card; show it in the
  // viewer's language.
  const meta = [card.category ? categoryNames.sub(card.category) : null, card.location]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link
      to={`/vendors/${card.vendor_id}`}
      className="flex items-center gap-3 p-3 rounded-sm bg-background/60 border border-border hover:border-foreground/30 transition-colors max-w-sm group"
    >
      {card.logo_url ? (
        <img
          src={card.logo_url}
          alt=""
          loading="lazy"
          className="w-9 h-9 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-9 h-9 rounded bg-secondary flex items-center justify-center flex-shrink-0">
          <Store className="w-4 h-4" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{card.business_name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {meta || t("shared_vendor_card.view_profile")}
        </p>
      </div>
      <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 group-hover:text-accent transition-colors" />
    </Link>
  );
}
