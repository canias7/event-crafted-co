import { useEffect } from "react";
import { Trans, useTranslation } from "react-i18next";
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
  const { t } = useTranslation("auth");
  useEffect(() => {
    document.title = t("account_deletion.meta_title");
    return () => {
      document.title = t("account_deletion.default_title");
    };
  }, [t]);

  const strong = { strong: <strong /> };

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <article className="pt-32 pb-24 container mx-auto px-5 md:px-8 max-w-2xl">
        <p className="font-label text-accent mb-3">{t("account_deletion.eyebrow")}</p>
        <h1 className="font-editorial text-5xl md:text-5xl mb-3 leading-tight">
          {t("account_deletion.title")}
        </h1>
        <p className="text-sm text-muted-foreground mb-12">
          <Trans i18nKey="account_deletion.applies" ns="auth" components={strong} />
        </p>

        <div className="space-y-8 text-foreground leading-relaxed">
          <p>
            {t("account_deletion.intro")}
          </p>

          <Section title={t("account_deletion.app.title")}>
            <p className="mb-2">{t("account_deletion.app.lead")}</p>
            <ol className="list-decimal pl-5 space-y-1.5">
              <li>{t("account_deletion.app.step_open")}</li>
              <li>
                <Trans i18nKey="account_deletion.app.step_settings" ns="auth" components={strong} />
              </li>
              <li>
                <Trans i18nKey="account_deletion.app.step_delete" ns="auth" components={strong} />
              </li>
              <li>
                <Trans i18nKey="account_deletion.app.step_confirm" ns="auth" components={strong} />
              </li>
            </ol>
            <p className="mt-3">
              {t("account_deletion.app.result")}
            </p>
          </Section>

          <Section title={t("account_deletion.email.title")}>
            <p>
              <Trans
                i18nKey="account_deletion.email.body"
                ns="auth"
                components={{
                  ...strong,
                  mail: (
                    <a
                      href="mailto:hello@eventvendora.com?subject=Delete%20my%20account"
                      className="text-accent font-medium"
                    />
                  ),
                }}
              />
            </p>
          </Section>

          <Section title={t("account_deletion.deleted.title")}>
            <p className="mb-2">
              {t("account_deletion.deleted.lead")}
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>{t("account_deletion.deleted.login")}</li>
              <li>
                {t("account_deletion.deleted.listings")}
              </li>
              <li>{t("account_deletion.deleted.messages")}</li>
              <li>{t("account_deletion.deleted.saved")}</li>
              <li>{t("account_deletion.deleted.push")}</li>
            </ul>
          </Section>

          <Section title={t("account_deletion.kept.title")}>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <Trans i18nKey="account_deletion.kept.audit" ns="auth" components={strong} />
              </li>
              <li>
                <Trans i18nKey="account_deletion.kept.legal" ns="auth" components={strong} />
              </li>
              <li>
                <Trans i18nKey="account_deletion.kept.backups" ns="auth" components={strong} />
              </li>
            </ul>
          </Section>

          <Section title={t("account_deletion.questions.title")}>
            <p>
              <Trans
                i18nKey="account_deletion.questions.body"
                ns="auth"
                components={{
                  mail: (
                    <a
                      href="mailto:hello@eventvendora.com"
                      className="text-accent font-medium"
                    />
                  ),
                  privacy: <a href="/privacy" className="text-accent font-medium" />,
                }}
              />
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
      <div className="text-sm leading-relaxed text-foreground space-y-2">
        {children}
      </div>
    </section>
  );
}
