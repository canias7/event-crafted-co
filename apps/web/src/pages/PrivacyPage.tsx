import { useEffect } from "react";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";

export default function PrivacyPage() {
  useEffect(() => {
    document.title = "Privacy Policy — Vendora";
    return () => {
      document.title = "Vendora — Premium Event Planning & Vendor Marketplace";
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <article className="pt-32 pb-24 container mx-auto px-6 md:px-8 max-w-2xl">
        <p className="font-label text-accent mb-3">— LEGAL</p>
        <h1 className="font-editorial text-5xl md:text-5xl mb-3 leading-tight">
          Privacy policy
        </h1>
        <p className="text-sm text-muted-foreground mb-12">
          Last updated: May 3, 2026
        </p>

        <div className="space-y-8 text-foreground/80 leading-relaxed">
          <p>
            Vendora is a vendor-first event marketplace. This page describes
            what we collect, how we use it, and the rights you have over your
            data.
          </p>

          <Section title="1. What we collect">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Account info</strong> — your email, password (hashed),
                and the role you signed up as (host, vendor, or admin).
              </li>
              <li>
                <strong>Profile + event details</strong> — display name, optional
                phone, event type, date, location, budget range, and any notes
                you've shared during onboarding.
              </li>
              <li>
                <strong>Vendor profile</strong> — for vendors, your business
                name, category, bio, base price, location, service radius, and
                portfolio images you upload.
              </li>
              <li>
                <strong>Messages and inquiries</strong> — message bodies,
                inquiry details, status changes, and any reviews you post.
              </li>
              <li>
                <strong>Usage data</strong> — pages visited, features used,
                approximate location from IP. We do not sell this to third
                parties.
              </li>
            </ul>
          </Section>

          <Section title="2. How we use it">
            <p>
              We use your data to operate Vendora — matching hosts with
              relevant vendors, routing messages between you and a vendor,
              displaying public vendor profiles in our directory, sending
              transactional emails (signup confirmation, inquiry receipts), and
              improving the product.
            </p>
            <p className="mt-3">
              When the AI inquiry agent is enabled, your inquiry details and a
              vendor's prior messages are sent to Anthropic's Claude API to
              draft replies. The vendor reviews and approves every reply
              before it sends — drafts are never sent automatically.
            </p>
          </Section>

          <Section title="3. Who we share with">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Vendors you inquire with</strong> — when you send an
                inquiry, the vendor sees your event details and display name.
              </li>
              <li>
                <strong>Service providers</strong> — Supabase (hosting and
                database), and (for AI replies) Anthropic.
              </li>
              <li>
                <strong>No advertisers, no data brokers, no resellers.</strong>{" "}
                Vendora does not sell or rent your personal data.
              </li>
            </ul>
          </Section>

          <Section title="4. Cookies">
            <p>
              We use essential cookies for authentication and session
              management. With your consent we may use analytics cookies to
              understand which features get used. You can change cookie
              preferences from the banner shown on first visit, or in your
              browser settings.
            </p>
          </Section>

          <Section title="5. Your rights">
            <p>
              You can access, correct, export, or delete your data at any
              time. Most of this is available directly in your account settings;
              for a full export or deletion request, email{" "}
              <a
                href="mailto:privacy@vendora.events"
                className="text-accent font-medium"
              >
                privacy@vendora.events
              </a>
              . We respond within 30 days.
            </p>
            <p className="mt-3">
              EU/UK residents have rights under GDPR; California residents have
              rights under CCPA — both are honored regardless of where you
              live.
            </p>
          </Section>

          <Section title="6. Data retention">
            <p>
              We keep account data while your account is active and for 90 days
              after deletion (in case you change your mind). Anonymized usage
              data may be kept longer for analytics.
            </p>
          </Section>

          <Section title="7. Contact">
            <p>
              Questions about this policy or your data: email{" "}
              <a
                href="mailto:privacy@vendora.events"
                className="text-accent font-medium"
              >
                privacy@vendora.events
              </a>
              .
            </p>
          </Section>
        </div>
      </article>

      <Footer />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-editorial text-2xl mb-3">{title}</h2>
      <div className="text-sm leading-relaxed text-foreground/80 space-y-2">
        {children}
      </div>
    </section>
  );
}
