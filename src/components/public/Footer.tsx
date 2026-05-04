import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="bg-primary text-primary-foreground py-16 md:py-24">
      <div className="container mx-auto px-4 md:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
          <div className="col-span-2 md:col-span-1">
            <h3 className="font-display text-xl mb-4">Vendora</h3>
            <p className="text-sm opacity-70 leading-relaxed max-w-xs">
              {t("footer.tagline")}
            </p>
          </div>
          <div>
            <p className="font-label mb-4 opacity-50">{t("footer.vendors")}</p>
            <div className="space-y-3">
              <Link to="/vendors" className="block text-sm opacity-70 hover:opacity-100 transition-opacity">{t("footer.browse")}</Link>
              <Link to="/vendors/locations" className="block text-sm opacity-70 hover:opacity-100 transition-opacity">{t("footer.by_location")}</Link>
              <Link to="/vendor-apply" className="block text-sm opacity-70 hover:opacity-100 transition-opacity">{t("footer.for_vendors")}</Link>
            </div>
          </div>
          <div>
            <p className="font-label mb-4 opacity-50">{t("footer.company")}</p>
            <div className="space-y-3">
              <Link to="/how-it-works" className="block text-sm opacity-70 hover:opacity-100 transition-opacity">{t("footer.how_it_works")}</Link>
              <Link to="/inspiration" className="block text-sm opacity-70 hover:opacity-100 transition-opacity">{t("footer.inspiration")}</Link>
              <Link to="/real-events" className="block text-sm opacity-70 hover:opacity-100 transition-opacity">{t("footer.real_events")}</Link>
              <Link to="/changelog" className="block text-sm opacity-70 hover:opacity-100 transition-opacity">{t("footer.changelog")}</Link>
              <Link to="/press" className="block text-sm opacity-70 hover:opacity-100 transition-opacity">{t("footer.press")}</Link>
              <Link to="/status" className="block text-sm opacity-70 hover:opacity-100 transition-opacity">{t("footer.status")}</Link>
            </div>
          </div>
          <div>
            <p className="font-label mb-4 opacity-50">{t("footer.legal")}</p>
            <div className="space-y-3">
              <Link to="/privacy" className="block text-sm opacity-70 hover:opacity-100 transition-opacity">
                {t("footer.privacy")}
              </Link>
              <Link to="/terms" className="block text-sm opacity-70 hover:opacity-100 transition-opacity">
                {t("footer.terms")}
              </Link>
              <a
                href="mailto:hello@vendora.events"
                className="block text-sm opacity-70 hover:opacity-100 transition-opacity"
              >
                hello@vendora.events
              </a>
            </div>
          </div>
        </div>
        <div className="mt-16 pt-8 border-t border-primary-foreground/10 flex items-center justify-between gap-3 text-sm opacity-50 flex-wrap">
          <p>© {new Date().getFullYear()} Vendora. {t("footer.rights")}</p>
          <LanguageSwitcher tone="light" />
        </div>
      </div>
    </footer>
  );
}
