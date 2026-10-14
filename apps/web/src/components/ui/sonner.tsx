import { useTranslation } from "react-i18next";
import { Toaster as Sonner, toast } from "sonner";
import { useTheme } from "@/lib/theme";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Follows the site's theme switch (lib/theme.ts), not the OS setting.
const Toaster = ({ ...props }: ToasterProps) => {
  // Screen-reader name of the toast region (sonner appends the hotkey).
  const { t } = useTranslation("ui");
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      containerAriaLabel={t("toasts.region")}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-popover group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:rounded-xl group-[.toaster]:shadow-soft",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-gold group-[.toast]:text-ink",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
