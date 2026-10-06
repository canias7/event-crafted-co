import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { VendoraLogo } from "@/components/shared/VendoraLogo";

// The sign-in pages' top bar. The logo sits exactly where PublicNav puts
// it on every other page: the full lockup at the page container's edge,
// 20px down on phones and 28px from tablet up. The page's own link goes
// on the right; on phones it drops under the logo instead of squeezing it.
export function AuthTopBar({ children }: { children?: ReactNode }) {
  const { t } = useTranslation("auth");
  return (
    <div className="absolute inset-x-0 top-0 z-[3]">
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 pt-5 md:px-8 md:pt-7">
        <Link to="/" aria-label={t("shell.logo_label")}>
          <VendoraLogo size="md" color="#000" withTagline />
        </Link>
        {children ? (
          <div className="flex items-center gap-6 text-[13px]" style={{ color: "#000" }}>
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
