// Help / support landing page. Linked from the Settings page so a
// vendor or host who hits a snag has a single click to (a) email
// us, (b) find the answer in a tight FAQ, or (c) reach the legal
// pages they were already required to accept on signup.
//
// Public route — no auth gate. That way a logged-out user who's
// stuck signing in can still get help.

import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Mail, FileText, Lock, MessageCircle } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";

const SUPPORT_EMAIL = "support@eventvendora.com";

interface FAQ {
  q: string;
  a: string;
}

const VENDOR_FAQ: FAQ[] = [
  {
    q: "How long does listing approval take?",
    a: "Most submissions are reviewed within 24 hours on business days. You'll get an email when your listing goes live.",
  },
  {
    q: "Why are my photos uploading slowly?",
    a: "Each photo is resized and compressed in your browser before upload to keep storage costs down. With 100 photos this usually takes 10–15 seconds. If it's stuck at the same number for over a minute, refresh and try again — your draft text fields are saved automatically.",
  },
  {
    q: "What happens to my listing if I downgrade my plan?",
    a: "Your current cycle stays paid through its end. The new tier kicks in on the next renewal — credits, listing slots, and features adjust then. Existing photos and content are never touched by a tier change.",
  },
  {
    q: "Can I pause my listing temporarily?",
    a: "Not yet as a single switch — but you can block out an entire date range from the Calendar page and hosts will see you as unavailable for those days. Full pause is on the roadmap.",
  },
  {
    q: "Do hosts see the title I add to a blocked date?",
    a: "No. Titles are private to you. Hosts only see the date as unavailable — your note (\"Christian's birthday\", etc) never leaves your side of the app.",
  },
];

const HOST_FAQ: FAQ[] = [
  {
    q: "How do I message a vendor after sending an inquiry?",
    a: "Open the inquiry from your Inbox. Once the vendor responds, the conversation lives there — you'll get a notification when they reply.",
  },
  {
    q: "Is my payment information shared with vendors?",
    a: "No. Vendors never see your card or bank details. Payments (when we're handling them) flow through Stripe.",
  },
];

const BILLING_FAQ: FAQ[] = [
  {
    q: "How do I download an invoice?",
    a: "Vendor Subscription page → Billing panel → click View next to any invoice to open the Stripe-hosted PDF. Right-click → Save to download.",
  },
  {
    q: "Where do I update my card?",
    a: "Subscription page → Billing panel → Update. Opens the Stripe-secure payment-method page.",
  },
];

export default function HelpPage() {
  useEffect(() => {
    document.title = "Help — Vendora";
    return () => {
      document.title = "Vendora — Premium Event Planning & Vendor Marketplace";
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <main className="pt-32 pb-24 container mx-auto px-6 md:px-8 max-w-2xl">
        <p className="font-label text-accent mb-3">— HELP</p>
        <h1 className="font-editorial text-5xl md:text-5xl mb-3 leading-tight">
          How can we help?
        </h1>
        <p className="text-muted-foreground mb-8">
          Common questions below. Anything else, email us — we read every one.
        </p>

        {/* Primary contact card */}
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=Vendora%20support%20request`}
          className="block rounded-2xl border border-foreground/15 bg-card hover:bg-secondary/40 p-5 mb-10 transition-colors"
        >
          <div className="flex items-center gap-4">
            <span className="w-11 h-11 rounded-xl bg-accent/15 text-accent inline-flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground">Email support</p>
              <p className="text-sm text-muted-foreground">
                {SUPPORT_EMAIL} · usually a reply within 24 hours
              </p>
            </div>
            <span className="text-xs font-medium text-muted-foreground hover:text-foreground">
              Open →
            </span>
          </div>
        </a>

        <FAQSection title="Vendors" items={VENDOR_FAQ} />
        <FAQSection title="Hosts" items={HOST_FAQ} />
        <FAQSection title="Billing" items={BILLING_FAQ} />

        {/* Legal links — easy access from Help so vendors don't have
            to dig for the terms they agreed to on signup. */}
        <section className="mt-10 border-t border-border pt-6">
          <p className="font-label text-accent mb-3">— LEGAL</p>
          <ul className="space-y-2.5">
            <li>
              <Link
                to="/terms"
                className="inline-flex items-center gap-2 text-sm text-foreground hover:text-accent transition-colors"
              >
                <FileText className="w-4 h-4" />
                Terms of Service
              </Link>
            </li>
            <li>
              <Link
                to="/privacy"
                className="inline-flex items-center gap-2 text-sm text-foreground hover:text-accent transition-colors"
              >
                <Lock className="w-4 h-4" />
                Privacy Policy
              </Link>
            </li>
            <li>
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=Refund%20request`}
                className="inline-flex items-center gap-2 text-sm text-foreground hover:text-accent transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                Request a refund
              </a>
            </li>
          </ul>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function FAQSection({ title, items }: { title: string; items: FAQ[] }) {
  return (
    <section className="mb-8">
      <h2 className="font-editorial text-2xl mb-4">{title}</h2>
      <ul className="space-y-4">
        {items.map((item, i) => (
          <li key={i}>
            <p className="font-medium text-foreground mb-1">{item.q}</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
