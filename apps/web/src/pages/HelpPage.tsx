// Help / support landing page. Linked from the Settings page so a
// vendor or host who hits a snag has a single click to (a) email
// us, (b) find the answer in a tight FAQ, or (c) reach the legal
// pages they were already required to accept on signup.
//
// Public route — no auth gate. That way a logged-out user who's
// stuck signing in can still get help.

import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Mail, FileText, Lock, MessageCircle } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { CONTACT_EMAIL, Footer } from "@/components/public/Footer";

const INK = "#14161a";

interface FAQ {
  q: string;
  a: string;
}

// FAQ sections and their questions, in display order. The words live in
// locales/<language>/help.json under faq.<section>.title and
// faq.<section>.items.<question>.q / .a.
const FAQ_SECTIONS: { id: string; items: string[] }[] = [
  { id: "vendors", items: ["approval", "photos", "downgrade", "pause", "blocked_title"] },
  { id: "hosts", items: ["message", "payment_info"] },
  { id: "billing", items: ["invoice", "card"] },
];

export default function HelpPage() {
  const { t } = useTranslation("help");

  useEffect(() => {
    document.title = t("page_title");
    return () => {
      document.title = t("defaultTitle", { ns: "meta" });
    };
  }, [t]);

  return (
    <div className="min-h-screen text-[#f4f1ea]" style={{ backgroundColor: INK }}>
      <PublicNav tone="dark" />

      <main id="main-content" className="pt-12 md:pt-16 pb-24 container mx-auto px-5 md:px-8 max-w-2xl">
        <p className="font-label text-gold mb-3">{t("eyebrow")}</p>
        <h1 className="font-editorial text-5xl md:text-5xl mb-3 leading-tight">
          {t("title")}
        </h1>
        <p className="text-[#f4f1ea]/80 mb-8">
          {t("intro")}
        </p>

        {/* Primary contact card */}
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=Vendora%20support%20request`}
          className="block rounded-2xl border border-white/15 bg-white/[0.03] hover:border-white/40 p-5 mb-10 transition-colors"
        >
          <div className="flex items-center gap-4">
            <span className="w-11 h-11 rounded-xl bg-gold/15 text-gold inline-flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{t("email_card.title")}</p>
              <p className="text-sm text-[#f4f1ea]/80">
                {t("email_card.reply_time", { email: CONTACT_EMAIL })}
              </p>
            </div>
            <span className="text-xs font-bold text-gold">
              {t("email_card.open")}
            </span>
          </div>
        </a>

        {FAQ_SECTIONS.map((section) => (
          <FAQSection
            key={section.id}
            title={t(`faq.${section.id}.title`)}
            items={section.items.map((id) => ({
              q: t(`faq.${section.id}.items.${id}.q`),
              a: t(`faq.${section.id}.items.${id}.a`),
            }))}
          />
        ))}

        {/* Legal links — easy access from Help so vendors don't have
            to dig for the terms they agreed to on signup. */}
        <section className="mt-10 border-t border-white/15 pt-6">
          <p className="font-label text-gold mb-3">{t("legal.eyebrow")}</p>
          <ul className="space-y-2.5">
            <li>
              <Link
                to="/terms"
                className="inline-flex items-center gap-2 text-sm transition-colors hover:text-gold"
              >
                <FileText className="w-4 h-4" />
                {t("legal.terms")}
              </Link>
            </li>
            <li>
              <Link
                to="/privacy"
                className="inline-flex items-center gap-2 text-sm transition-colors hover:text-gold"
              >
                <Lock className="w-4 h-4" />
                {t("legal.privacy")}
              </Link>
            </li>
            <li>
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=Refund%20request`}
                className="inline-flex items-center gap-2 text-sm transition-colors hover:text-gold"
              >
                <MessageCircle className="w-4 h-4" />
                {t("legal.refund")}
              </a>
            </li>
          </ul>
        </section>
      </main>

      <Footer tone="dark" />
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
            <p className="font-medium mb-1">{item.q}</p>
            <p className="text-sm text-[#f4f1ea]/80 leading-relaxed">{item.a}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
