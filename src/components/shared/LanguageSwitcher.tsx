import { useTranslation } from "react-i18next";
import { Globe, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_LABELS,
  type SupportedLanguage,
} from "@/i18n";

// Compact language switcher for nav rails. Persists choice via the
// detector's localStorage cache (i18next handles that internally).
//
// `tone` controls hover color so it works against both dark hero
// backgrounds (PublicNav) and light dashboards.

export function LanguageSwitcher({
  tone = "dark",
}: {
  tone?: "dark" | "light";
}) {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage ?? "en") as SupportedLanguage;

  const triggerClass =
    tone === "dark"
      ? "text-background/70 hover:text-background"
      : "text-muted-foreground hover:text-foreground";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`inline-flex items-center gap-1.5 text-xs uppercase tracking-wide transition-colors ${triggerClass}`}
        aria-label={t("language_switcher.label")}
      >
        <Globe className="w-3.5 h-3.5" />
        {LANGUAGE_LABELS[current]}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang}
            onClick={() => i18n.changeLanguage(lang)}
            className="text-sm cursor-pointer"
          >
            <span className="flex-1">{LANGUAGE_LABELS[lang]}</span>
            {current === lang && <Check className="w-3.5 h-3.5 ml-2" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
