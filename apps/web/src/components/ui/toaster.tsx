import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";

export function Toaster() {
  const { toasts } = useToast();
  // Screen-reader labels Radix announces; "{hotkey}" is filled in by Radix.
  const { t } = useTranslation("ui");

  return (
    <ToastProvider label={t("toasts.item")}>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport label={t("toasts.viewport")} />
    </ToastProvider>
  );
}
