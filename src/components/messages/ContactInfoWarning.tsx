import { Info } from "lucide-react";
import { detectContactInfo, contactInfoLabel } from "@/lib/contactInfoSignals";

/**
 * Soft warning surfaced inline above the composer when the user types
 * what looks like contact info. Doesn't block — just nudges. By design.
 */
export function ContactInfoWarning({ body }: { body: string }) {
  const flags = detectContactInfo(body);
  if (!flags.any) return null;
  return (
    <div className="rounded-sm border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-accent flex items-start gap-2">
      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <p className="leading-relaxed">
        Looks like a {contactInfoLabel(flags)}. We don't block these — but
        Vendora's protections (dispute resolution, secure payments,
        cancellation policy) only apply to messages and bookings on the
        platform. Try to keep things here until you've booked.
      </p>
    </div>
  );
}
