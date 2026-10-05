import { useEffect } from "react";
import { Trans, useTranslation } from "react-i18next";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";

export default function PrivacyPage() {
  // The policy's words are in locales/<language>/privacy.json.
  const { t, i18n } = useTranslation("privacy");
  // A translated policy says the English one prevails; English doesn't.
  const isTranslation = (i18n.resolvedLanguage ?? "en") !== "en";

  useEffect(() => {
    document.title = t("page_title");
    return () => {
      document.title = t("defaultTitle", { ns: "meta" });
    };
  }, [t]);

  // A sentence with bold lead-ins (<strong>) or the email link (<email>).
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

          <Section title={t("collect.title")}>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>{rich("collect.account")}</li>
              <li>{rich("collect.profile")}</li>
              <li>{rich("collect.vendor_profile")}</li>
              <li>{rich("collect.messages")}</li>
              <li>{rich("collect.usage")}</li>
            </ul>
          </Section>

          <Section title={t("use.title")}>
            <p>
              {t("use.operate")}
            </p>
            <p className="mt-3">
              {t("use.ai")}
            </p>
          </Section>

          <Section title={t("share.title")}>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>{rich("share.vendors")}</li>
              <li>{rich("share.providers")}</li>
              <li>{rich("share.no_sale")}</li>
            </ul>
          </Section>

          <Section title={t("cookies.title")}>
            <p>
              {t("cookies.body")}
            </p>
          </Section>

          <Section title={t("rights.title")}>
            <p>
              {rich("rights.access")}
            </p>
            <p className="mt-3">
              {t("rights.laws")}
            </p>
          </Section>

          <Section title={t("retention.title")}>
            <p>
              {t("retention.body")}
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
