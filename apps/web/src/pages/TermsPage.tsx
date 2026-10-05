import { useEffect } from "react";
import { Trans, useTranslation } from "react-i18next";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";

export default function TermsPage() {
  // The terms' words are in locales/<language>/terms.json.
  const { t, i18n } = useTranslation("terms");
  // Translated terms say the English ones prevail; English doesn't.
  const isTranslation = (i18n.resolvedLanguage ?? "en") !== "en";

  useEffect(() => {
    document.title = t("page_title");
    return () => {
      document.title = t("defaultTitle", { ns: "meta" });
    };
  }, [t]);

  // A sentence with bold words (<strong>) or the email link (<email>).
  const rich = (key: string) => (
    <Trans
      t={t}
      i18nKey={key}
      components={{
        strong: <strong />,
        email: (
          <a
            href="mailto:hello@eventvendora.com"
            className="text-gold font-medium hover:text-white"
          />
        ),
      }}
    />
  );

  return (
    <div className="min-h-screen text-[#f4f1ea]" style={{ backgroundColor: "#14161a" }}>
      <PublicNav tone="dark" />

      <article id="main-content" className="pt-12 md:pt-16 pb-24 container mx-auto px-5 md:px-8 max-w-2xl">
        <p className="font-label text-gold mb-3">{t("eyebrow")}</p>
        <h1 className="font-editorial text-5xl md:text-5xl mb-3 leading-tight">
          {t("title")}
        </h1>
        <p className={`text-sm text-[#f4f1ea]/80 ${isTranslation ? "mb-2" : "mb-12"}`}>
          {t("last_updated")}
        </p>
        {isTranslation && (
          <p className="text-sm text-[#f4f1ea]/80 mb-12">
            {t("translation_note")}
          </p>
        )}

        <div className="space-y-8 leading-relaxed">
          <p>
            {t("intro")}
          </p>

          <Section title={t("eligibility.title")}>
            <p>
              {t("eligibility.body")}
            </p>
          </Section>

          <Section title={t("account.title")}>
            <p>
              {rich("account.body")}
            </p>
          </Section>

          <Section title={t("hosts.title")}>
            <p>
              {t("hosts.body")}
            </p>
          </Section>

          <Section title={t("vendors.title")}>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>{rich("vendors.commission")}</li>
              <li>{rich("vendors.membership")}</li>
              <li>{rich("vendors.your_data")}</li>
              <li>{t("vendors.ranking")}</li>
              <li>{t("vendors.delivery")}</li>
            </ul>
          </Section>

          <Section title={t("conduct.title")}>
            <p>
              {t("conduct.body")}
            </p>
          </Section>

          <Section title={t("content.title")}>
            <p>
              {t("content.body")}
            </p>
          </Section>

          <Section title={t("ai.title")}>
            <p>
              {t("ai.body")}
            </p>
          </Section>

          <Section title={t("disclaimers.title")}>
            <p>
              {t("disclaimers.body")}
            </p>
          </Section>

          <Section title={t("liability.title")}>
            <p>
              {t("liability.body")}
            </p>
          </Section>

          <Section title={t("termination.title")}>
            <p>
              {t("termination.body")}
            </p>
          </Section>

          <Section title={t("law.title")}>
            <p>
              {t("law.body")}
            </p>
          </Section>

          <Section title={t("contact.title")}>
            <p>
              {rich("contact.body")}
            </p>
          </Section>
        </div>
      </article>

      <Footer tone="dark" />
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
      <div className="text-sm leading-relaxed space-y-2">
        {children}
      </div>
    </section>
  );
}
