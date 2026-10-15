// Light / dark switch (owner's call, Oct 2026). A round icon button: a
// moon in light mode (turns dark on), a sun in dark mode. Shown in the
// top menu of every public page, on the sign-in pages and in the
// portals' sidebars.
import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation("ui");
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const label = dark ? t("theme.toLight") : t("theme.toDark");
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:text-accent",
        className,
      )}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
