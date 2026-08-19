import { useEffect } from "react";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";

// Account & data deletion instructions. Linked from the Google Play
// "Data safety" form (account deletion URL) and the App Store / web
// footer. Google requires this page to (1) name the app/developer,
// (2) spell out the steps to request deletion, and (3) state what data
// is deleted vs retained and any retention periods. Keep it in sync with
// request_account_deletion() (migration 20260512120000) and the Privacy
// Policy's retention section.
export default function AccountDeletionPage() {
  useEffect(() => {
    document.title = "Delete your account — Vendora";
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
          Delete your account
        </h1>
        <p className="text-sm text-muted-foreground mb-12">
          Applies to the <strong>Vendora</strong> and{" "}
          <strong>Vendora for Vendors</strong> apps. Last updated: June 17, 2026.
        </p>

        <div className="space-y-8 text-foreground/80 leading-relaxed">
          <p>
            You can permanently delete your Vendora account and its associated
            data at any time. Here's how, and exactly what happens to your data.
          </p>

          <Section title="1. Delete it from the app (fastest)">
            <p className="mb-2">In the Vendora app:</p>
            <ol className="list-decimal pl-5 space-y-1.5">
              <li>Open the app and sign in.</li>
              <li>
                Go to <strong>More (•••) → Settings</strong> (on the website:{" "}
                <strong>Settings</strong>).
              </li>
              <li>
                Tap <strong>Delete account</strong>.
              </li>
              <li>
                Confirm with <strong>Yes, delete it</strong>.
              </li>
            </ol>
            <p className="mt-3">
              Your account is deleted immediately and you're signed out. This
              cannot be undone.
            </p>
          </Section>

          <Section title="2. Or request it by email">
            <p>
              If you can't sign in, email{" "}
              <a
                href="mailto:hello@eventvendora.com?subject=Delete%20my%20account"
                className="text-accent font-medium"
              >
                hello@eventvendora.com
              </a>{" "}
              from the email address on your account, with the subject{" "}
              <strong>"Delete my account."</strong> We verify ownership and
              complete the deletion within 30 days.
            </p>
          </Section>

          <Section title="3. What gets deleted">
            <p className="mb-2">
              Deleting your account permanently removes:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Your login (email and password) and profile.</li>
              <li>
                Your vendor listings and the portfolio / gallery photos you
                uploaded.
              </li>
              <li>Your messages, inquiries, and conversation threads.</li>
              <li>Saved searches, saved vendors, and planning data.</li>
              <li>Push-notification tokens for your devices.</li>
            </ul>
          </Section>

          <Section title="4. What's kept, and for how long">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Anonymized moderation / audit records</strong> — kept
                with your personal identifiers removed, for safety and abuse
                prevention.
              </li>
              <li>
                <strong>Records required by law</strong> (e.g. tax or
                fraud-prevention records) — retained only as long as the law
                requires, then deleted.
              </li>
              <li>
                <strong>Encrypted backups</strong> — purged on a rolling basis,
                within 30 days of deletion.
              </li>
            </ul>
          </Section>

          <Section title="5. Questions">
            <p>
              Email{" "}
              <a
                href="mailto:hello@eventvendora.com"
                className="text-accent font-medium"
              >
                hello@eventvendora.com
              </a>{" "}
              and we'll help. See our{" "}
              <a href="/privacy" className="text-accent font-medium">
                Privacy Policy
              </a>{" "}
              for more on how we handle your data.
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
