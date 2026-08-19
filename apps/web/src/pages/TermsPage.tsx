import { useEffect } from "react";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";

export default function TermsPage() {
  useEffect(() => {
    document.title = "Terms of Service — Vendora";
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
          Terms of service
        </h1>
        <p className="text-sm text-muted-foreground mb-12">
          Last updated: May 3, 2026
        </p>

        <div className="space-y-8 text-foreground/80 leading-relaxed">
          <p>
            By using Vendora, you agree to these terms. If you don't, please
            don't use the platform. We may update these terms; meaningful
            changes will be announced via email and a banner notice 30 days
            before they take effect.
          </p>

          <Section title="1. Eligibility">
            <p>
              You must be at least 18 years old and able to enter a binding
              contract in your jurisdiction. Vendors must be a legitimate
              business — sole proprietors, LLCs, corporations.
            </p>
          </Section>

          <Section title="2. Your account">
            <p>
              You're responsible for keeping your password safe and for any
              activity under your account. Tell us immediately at{" "}
              <a
                href="mailto:hello@eventvendora.com"
                className="text-accent font-medium"
              >
                hello@eventvendora.com
              </a>{" "}
              if you suspect unauthorized access.
            </p>
          </Section>

          <Section title="3. For hosts">
            <p>
              Browsing Vendora and sending inquiries is free for hosts. When
              you book a vendor, you contract directly with that vendor —
              Vendora is the introduction layer, not the contracting party.
              Payment terms, cancellation policies, and deliverables are
              between you and the vendor.
            </p>
          </Section>

          <Section title="4. For vendors">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                Vendora charges <strong>3% on confirmed bookings</strong>{" "}
                ("won" inquiries). No listing fees, no monthly minimums.
              </li>
              <li>
                Membership is <strong>month-to-month</strong>; you can pause
                or leave any time without penalty.
              </li>
              <li>
                Vendor profiles, portfolios, and reviews are{" "}
                <strong>your data</strong>. You can export your reviews at
                any time, including if you leave the platform.
              </li>
              <li>
                We do not accept money to influence search ranking. Sort
                order is determined by fit and quality signals only.
              </li>
              <li>
                You're responsible for delivering the services you describe
                in your profile and quotes.
              </li>
            </ul>
          </Section>

          <Section title="5. Prohibited conduct">
            <p>
              You agree not to: scrape vendor data, attempt to circumvent
              Vendora's commission by transacting off-platform after an
              introduction, post false or misleading reviews, harass other
              users, or use the platform for anything illegal.
            </p>
          </Section>

          <Section title="6. Content + intellectual property">
            <p>
              You retain ownership of everything you upload (portfolio images,
              messages, reviews). By posting, you grant Vendora a worldwide,
              royalty-free license to display it within the platform and (for
              vendors) in editorial features that promote your business.
            </p>
          </Section>

          <Section title="7. AI-assisted replies">
            <p>
              When the AI inquiry agent is active, vendors review and approve
              every drafted reply before it sends. Vendora is not responsible
              for the content of vendor messages, AI-drafted or otherwise.
            </p>
          </Section>

          <Section title="8. Disclaimers">
            <p>
              Vendora is provided "as is." We don't guarantee any specific
              vendor's availability, quality, or performance — vendors are
              independent businesses. Reviews are user-submitted opinion.
            </p>
          </Section>

          <Section title="9. Limitation of liability">
            <p>
              To the fullest extent permitted by law, Vendora's liability is
              limited to fees you've paid us in the 12 months prior to a
              claim. We're not liable for indirect, consequential, or punitive
              damages.
            </p>
          </Section>

          <Section title="10. Termination">
            <p>
              You can close your account anytime from your settings. We can
              suspend accounts that violate these terms with notice (or
              without notice for severe violations).
            </p>
          </Section>

          <Section title="11. Governing law">
            <p>
              These terms are governed by the laws of the State of New York,
              without regard to conflict-of-law principles. Disputes are
              resolved in courts located in New York County.
            </p>
          </Section>

          <Section title="12. Contact">
            <p>
              Questions about these terms:{" "}
              <a
                href="mailto:hello@eventvendora.com"
                className="text-accent font-medium"
              >
                hello@eventvendora.com
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
