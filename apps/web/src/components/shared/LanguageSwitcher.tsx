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
  changeLanguage,
  type SupportedLanguage,
} from "@/i18n";

// Compact language switcher for nav rails. Persists choice via the
// detector's localStorage cache (i18next handles that internally).
//
// It follows the site theme (light by default, dark with the switch);
// `tone` is kept only so old call sites compile.

export function LanguageSwitcher(_props: { tone?: "dark" | "light" } = {}) {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage ?? "en") as SupportedLanguage;

  const triggerClass = "text-muted-foreground hover:text-accent";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`inline-flex items-center gap-1.5 text-xs uppercase tracking-wide transition-colors ${triggerClass}`}
        aria-label={t("language_switcher.label")}
      >
        <Globe className="w-3.5 h-3.5" />
        <span lang={current}>{LANGUAGE_LABELS[current]}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang}
            onClick={() => void changeLanguage(lang)}
            className="text-sm cursor-pointer"
          >
            {/* Each name in its own language, marked so screen readers say it right. */}
            <span className="flex-1" lang={lang}>
              {LANGUAGE_LABELS[lang]}
            </span>
            {current === lang && <Check className="w-3.5 h-3.5 ml-2" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
