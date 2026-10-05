import { useTranslation } from "react-i18next";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Pinned to the light palette — the app no longer supports a theme
// toggle (see useTheme deletion + index.html). Sonner's own next-themes
// integration would otherwise fall back to OS preference and produce
// dark toasts on dark-mode machines.
const Toaster = ({ ...props }: ToasterProps) => {
  // Screen-reader name of the toast region (sonner appends the hotkey).
  const { t } = useTranslation("ui");
  return (
    <Sonner
      theme="light"
      containerAriaLabel={t("toasts.region")}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:rounded-xl group-[.toaster]:shadow-soft",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-gold group-[.toast]:text-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
