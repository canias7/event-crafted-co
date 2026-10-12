import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, Mail } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CONTACT_EMAIL } from "@/lib/contact";

// Every "email us" link on the site. A plain mailto: link seems to do
// nothing on most computers, where no email app is set up and people read
// their mail in the browser, so the address opens a small menu instead:
// the device's email app, or copy the address. One component, so a change here shows up on every page that uses it.
//
// `children` is what's clicked (the address, a sentence's link text, a
// card); with `asChild` the child element itself becomes the trigger (use
// it for a <Button> or a card). Works as a <Trans> component too.
export function EmailMenu({
  email = CONTACT_EMAIL,
  subject,
  className,
  asChild,
  align = "start",
  children,
}: {
  email?: string;
  subject?: string;
  className?: string;
  asChild?: boolean;
  align?: "start" | "center" | "end";
  children?: ReactNode;
}) {
  const { t } = useTranslation("shell");
  const su = subject ? encodeURIComponent(subject) : "";

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
      <DropdownMenuTrigger asChild={asChild} className={asChild ? undefined : className}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[13rem]">
        <DropdownMenuItem
          onSelect={() => {
            window.location.href = `mailto:${email}${su ? `?subject=${su}` : ""}`;
          }}
        >
          <Mail className="mr-2 h-4 w-4" aria-hidden />
          {t("email_menu.app")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void copy()}>
          <Copy className="mr-2 h-4 w-4" aria-hidden />
          {t("email_menu.copy")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
