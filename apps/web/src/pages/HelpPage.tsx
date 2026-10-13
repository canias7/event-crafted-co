// Help / support landing page. Linked from the Settings page so a
// vendor or host who hits a snag has a single click to (a) email
// us, (b) find the answer in a tight FAQ, or (c) reach the legal
// pages they were already required to accept on signup.
//
// Public route — no auth gate. That way a logged-out user who's
// stuck signing in can still get help.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { Mail, FileText, Lock, Search } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { EmailMenu } from "@/components/shared/EmailMenu";
import { CONTACT_EMAIL } from "@/lib/contact";

const INK = "#14161a";

// FAQ sections and their questions, in display order. The words live in
// locales/<language>/help.json under faq.<section>.title and
// faq.<section>.items.<question>.q / .a. Answers can link with
// <vendors>, <signup>, <terms>, <settings> and <email> tags.
const FAQ_SECTIONS: { id: string; items: string[] }[] = [
  {
    id: "hosts",
    items: ["free", "find", "contact", "message", "payment_info", "problem"],
  },
  {
    id: "vendors",
    items: [
      "free",
      "commission",
      "approval",
      "inquiries",
      "pause",
      "downgrade",
      "blocked_title",
      "photos",
    ],
  },
  {
    id: "billing",
    items: ["card", "invoice", "cancel", "after_cancel", "delete", "switch"],
  },
];

const FAQ_LINK = "text-gold underline underline-offset-2 hover:text-[#f4f1ea]";
const FAQ_LINKS = {
  vendors: <Link to="/vendors" className={FAQ_LINK} />,
  signup: <Link to="/signup/vendor" className={FAQ_LINK} />,
  terms: <Link to="/terms" className={FAQ_LINK} />,
  email: <EmailMenu className={FAQ_LINK} />,
};

// Lowercase, accents stripped, so "cancelación" matches "cancelacion".
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Answer text without its <tag> markup, for searching.
function plain(text: string): string {
  return text.replace(/<\/?[a-zA-Z]+>/g, "");
}

export default function HelpPage() {
  const { t } = useTranslation("help");
  const [query, setQuery] = useState("");

  // Sections with only the questions that match the search; sections
  // with no match drop out.
  const sections = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    return FAQ_SECTIONS.map((section) => ({
      id: section.id,
      title: t(`faq.${section.id}.title`),
      items: section.items
        .map((id) => ({ key: `faq.${section.id}.items.${id}` }))
        .filter(({ key }) => {
          if (words.length === 0) return true;
          const text = fold(`${t(`${key}.q`)} ${plain(t(`${key}.a`))}`);
          return words.every((w) => text.includes(w));
        }),
    })).filter((section) => section.items.length > 0);
  }, [query, t]);

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
        <EmailMenu subject="Vendora support request" asChild>
        <button
          type="button"
          className="block w-full text-left rounded-2xl border border-white/15 bg-white/[0.03] hover:border-white/40 p-5 mb-10 transition-colors"
        >
          <span className="flex items-center gap-4">
            <span className="w-11 h-11 rounded-xl bg-gold/15 text-gold inline-flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5" />
            </span>
            <span className="block flex-1 min-w-0">
              <span className="block font-semibold">{t("email_card.title")}</span>
              <span className="block text-sm text-[#f4f1ea]/80">
                {CONTACT_EMAIL}
              </span>
            </span>
            <span className="text-xs font-bold text-gold">
              {t("email_card.open")}
            </span>
          </span>
        </button>
        </EmailMenu>

        {/* Search filters the questions below as you type. */}
        <label className="relative block mb-8">
          <span className="sr-only">{t("search.label")}</span>
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#f4f1ea]/60"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search.placeholder")}
            className="w-full h-11 rounded-xl border border-white/15 bg-white/[0.03] pl-11 pr-4 text-sm text-[#f4f1ea] placeholder:text-[#f4f1ea]/60 focus:outline-none focus:border-white/40"
          />
        </label>

        {sections.map((section) => (
          <section key={section.id} className="mb-10">
            <h2 className="font-editorial text-2xl mb-4">{section.title}</h2>
            <Accordion type="multiple" className="space-y-3">
              {section.items.map((item) => (
                <AccordionItem
                  key={item.key}
                  value={item.key}
                  className="rounded-xl border border-white/15 px-5 data-[state=open]:border-white/30"
                >
                  <AccordionTrigger className="py-4 text-left text-[15px] font-bold hover:no-underline [&>svg]:text-gold">
                    {t(`${item.key}.q`)}
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 text-sm leading-relaxed text-[#f4f1ea]/80">
                    <Trans t={t} i18nKey={`${item.key}.a`} components={FAQ_LINKS} />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        ))}

        {sections.length === 0 && (
          <p className="text-sm text-[#f4f1ea]/80 mb-10">
            <Trans t={t} i18nKey="search.none" components={FAQ_LINKS} />
          </p>
        )}

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
          </ul>
        </section>
      </main>

      <Footer tone="dark" />
    </div>
  );
}
