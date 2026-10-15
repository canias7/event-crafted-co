import { useEffect } from "react";
import { Trans, useTranslation } from "react-i18next";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { EmailMenu } from "@/components/shared/EmailMenu";

// Sections in order. Each one in privacy.json has a title plus a "body"
// paragraph and/or a list of "items", and an optional "after" paragraph.
const SECTIONS = [
  "collect",
  "use",
  "share",
  "cookies",
  "emails",
  "rights",
  "retention",
  "children",
  "security",
  "international",
  "changes",
  "contact",
] as const;

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
          <EmailMenu className="text-accent font-medium underline-offset-2 hover:underline" />
        ),
      }}
    />
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNav tone="dark" />

      <article id="main-content" className="pt-12 md:pt-16 pb-24 container mx-auto px-5 md:px-8 max-w-2xl">
        <p className="font-label text-accent mb-3">{t("eyebrow")}</p>
        <h1 className="font-editorial text-5xl md:text-5xl mb-3 leading-tight">
          {t("title")}
        </h1>
        <p className={`text-sm text-muted-foreground ${isTranslation ? "mb-2" : "mb-12"}`}>
          {t("last_updated")}
        </p>
        {isTranslation && (
          <p className="text-sm text-muted-foreground mb-12">
            {t("translation_note")}
          </p>
        )}

        <div className="space-y-8 leading-relaxed">
          <p>{rich("intro")}</p>

          {SECTIONS.map((key) => {
            const items = t(`${key}.items`, { returnObjects: true });
            return (
              <Section key={key} title={t(`${key}.title`)}>
                {i18n.exists(`${key}.body`, { ns: "privacy" }) && (
                  <p>{rich(`${key}.body`)}</p>
                )}
                {Array.isArray(items) && (
                  <ul className="list-disc pl-5 space-y-1.5">
                    {items.map((_, i) => (
                      <li key={i}>{rich(`${key}.items.${i}`)}</li>
                    ))}
                  </ul>
                )}
                {i18n.exists(`${key}.after`, { ns: "privacy" }) && (
                  <p>{rich(`${key}.after`)}</p>
                )}
              </Section>
            );
          })}
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
      <div className="text-sm leading-relaxed space-y-2">
        {children}
      </div>
    </section>
  );
}
