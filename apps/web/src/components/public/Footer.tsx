import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Instagram, Mail } from "lucide-react";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { VendoraLogo } from "@/components/shared/VendoraLogo";

export const INSTAGRAM_URL = "https://www.instagram.com/event_vendora/";
export const INSTAGRAM_HANDLE = "@event_vendora";
export const CONTACT_EMAIL = "hello@eventvendora.com";

// The site footer on every public page: logo, Instagram and email, then
// For hosts / For vendors / Company links. `tone="dark"` for the dark
// pages (home, Explore, How it works, For hosts, For vendors): cream text
// on ink, champagne labels, white-at-15% hairlines.
export function Footer({ tone = "light" }: { tone?: "light" | "dark" } = {}) {
  const { t } = useTranslation();
  const dark = tone === "dark";
  const link = `text-sm transition-colors ${dark ? "hover:text-gold" : "hover:text-accent"}`;

  const columns: { title: string; links: { label: string; to: string }[] }[] = [
    {
      title: "For hosts",
      links: [
        { label: "Plan with Vendora", to: "/for-hosts" },
        { label: "Browse vendors", to: "/vendors" },
        { label: t("footer.by_location"), to: "/vendors/locations" },
        { label: "Explore", to: "/explore" },
      ],
    },
    {
      title: "For vendors",
      links: [
        { label: "Grow with Vendora", to: "/for-vendors" },
        { label: "List your business", to: "/signup/vendor" },
        { label: "How it works", to: "/how-it-works" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "Help", to: "/help" },
        { label: "Status", to: "/status" },
        { label: "Press", to: "/press" },
        { label: "Changelog", to: "/changelog" },
        { label: t("footer.privacy"), to: "/privacy" },
        { label: t("footer.terms"), to: "/terms" },
      ],
    },
  ];

  return (
    <footer
      className={`py-16 md:py-20 ${dark ? "text-[#f4f1ea]" : "text-foreground"}`}
      style={{
        // Light tone stays transparent so the page's warm wash shows
        // through; the hairline marks where the footer starts.
        background: dark ? "#14161a" : "transparent",
        borderTop: dark
          ? "1px solid rgba(255,255,255,0.15)"
          : "1px solid hsl(var(--border))",
      }}
    >
      <div className="container mx-auto px-5 md:px-8">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-[2fr_1fr_1fr_1fr] md:gap-12">
          <div className="col-span-2 md:col-span-1">
            <Link to="/" aria-label="Vendora home" className="inline-block">
              <VendoraLogo size="md" color={dark ? "#f4f1ea" : "#14161a"} withTagline={dark} />
            </Link>
            <p className="m-0 mt-3 max-w-xs text-sm leading-relaxed">{t("footer.tagline")}</p>
            <div className="mt-5 flex flex-col items-start gap-3">
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-2 ${link}`}
              >
                <Instagram className={`h-4 w-4 ${dark ? "text-gold" : "text-accent"}`} aria-hidden />
                {INSTAGRAM_HANDLE}
              </a>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className={`inline-flex items-center gap-2 [overflow-wrap:anywhere] ${link}`}
              >
                <Mail className={`h-4 w-4 shrink-0 ${dark ? "text-gold" : "text-accent"}`} aria-hidden />
                {CONTACT_EMAIL}
              </a>
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <p className={`m-0 mb-4 font-label ${dark ? "text-gold" : "text-accent"}`}>
                {col.title}
              </p>
              <ul className="m-0 list-none space-y-3 p-0">
                {col.links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className={link}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className={`mt-14 flex flex-wrap items-center justify-between gap-3 border-t pt-8 text-sm ${
            dark ? "border-white/15" : "border-border"
          }`}
        >
          <p className="m-0">
            © {new Date().getFullYear()} Vendora. {t("footer.rights")}
          </p>
          <LanguageSwitcher tone={dark ? "dark" : "light"} />
        </div>
      </div>
    </footer>
  );
}
