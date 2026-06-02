import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer
      className="text-foreground py-16 md:py-24"
      style={{
        // Transparent so the page's warm wash bleeds through; soft
        // amber-tinted hairline instead of the hard grey border so
        // the footer feels like a continuation of the canvas instead
        // of a fenced-off white block.
        background: "transparent",
        borderTop: "0.5px solid rgba(0,0,0,0.16)",
      }}
    >
      <div className="container mx-auto px-4 md:px-8">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-8 md:gap-12">
          <div className="col-span-2 md:col-span-1">
            <h3 className="font-editorial text-2xl mb-4">Vendora</h3>
            <p className="text-sm opacity-70 leading-relaxed max-w-xs">
              {t("footer.tagline")}
            </p>
          </div>
          <div>
            <p className="font-label mb-4 opacity-50">{t("footer.vendors")}</p>
            <div className="space-y-3">
              <Link to="/vendors" className="block text-sm opacity-70 hover:opacity-100 transition-opacity">{t("footer.browse")}</Link>
              <Link to="/vendors/locations" className="block text-sm opacity-70 hover:opacity-100 transition-opacity">{t("footer.by_location")}</Link>
              <Link to="/explore" className="block text-sm opacity-70 hover:opacity-100 transition-opacity">Explore</Link>
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
        <div className="mt-16 pt-8 border-t border-foreground/10 flex items-center justify-between gap-3 text-sm opacity-60 flex-wrap">
          <p>© {new Date().getFullYear()} Vendora. {t("footer.rights")}</p>
          <LanguageSwitcher tone="dark" />
        </div>
      </div>
    </footer>
  );
}
