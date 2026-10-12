import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, ExternalLink, Mail } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// A plain mailto: link seems to do nothing on most computers, where no
// email app is set up and people read their mail in the browser. So the
// address opens a small menu instead: Gmail, Outlook, the device's email
// app, or copy the address.
export function EmailMenu({
  email,
  className,
  children,
}: {
  email: string;
  className?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation("shell");
  const to = encodeURIComponent(email);
  const open = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      toast.success(t("email_menu.copied"));
    } catch {
      toast(email);
    }
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className={className}>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[13rem]">
        <DropdownMenuItem
          onSelect={() => open(`https://mail.google.com/mail/?view=cm&fs=1&to=${to}`)}
        >
          <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
          {t("email_menu.gmail")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => open(`https://outlook.live.com/mail/0/deeplink/compose?to=${to}`)}
        >
          <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
          {t("email_menu.outlook")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            window.location.href = `mailto:${email}`;
          }}
        >
          <Mail className="mr-2 h-4 w-4" aria-hidden />
          {t("email_menu.app")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void copy()}>
          <Copy className="mr-2 h-4 w-4" aria-hidden />
          {t("email_menu.copy")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
