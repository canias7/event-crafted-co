// Sign-in role chooser. /login lands here; user picks Host or Vendor
// and we forward to /login/host or /login/vendor. Adapted from the
// new glassy-amber-grid design — same canvas as the landing page so
// the auth surface reads as one continuous brand world.

import { Link, Navigate } from "react-router-dom";
import { CalendarHeart, Briefcase, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { AuthTopBar } from "@/components/auth/AuthTopBar";

export default function LoginRoleChooserPage() {
  // Already authenticated? Skip the chooser and drop them in the
  // portal they belong to. (Catches users who hit /login from an
  // old tab while already signed in elsewhere.)
  const { session, hasVendorAccess, hasHostAccess, loading } = useAuth();
  const { t } = useTranslation("auth");
  if (!loading && session) {
    if (hasVendorAccess) return <Navigate to="/vendor/me" replace />;
    if (hasHostAccess) return <Navigate to="/customer/explore" replace />;
  }
  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ background: "transparent", color: "#000" }}
    >
      {/* Ambient glow — primary upper-left blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute z-0"
        style={{
          top: "30%",
          left: "35%",
          transform: "translate(-50%, -50%)",
          width: "900px",
          height: "700px",
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.025) 30%, rgba(0,0,0,0.012) 55%, transparent 75%)",
        }}
      />

      {/* Secondary glow — bottom-right */}
      <div
        aria-hidden
        className="pointer-events-none absolute z-0"
        style={{
          bottom: 0,
          right: "-10%",
          width: "700px",
          height: "600px",
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.025) 40%, transparent 70%)",
        }}
      />

      {/* Perspective grid — scrolling toward horizon */}
      <div
        aria-hidden
        className="pointer-events-none absolute z-0 inset-x-0"
        style={{
          bottom: 0,
          height: "500px",
          perspective: "800px",
          overflow: "hidden",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, #000 35%, #000 100%)",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, #000 35%, #000 100%)",
        }}
      >
        <div
          className="login-grid-scroll"
          style={{
            position: "absolute",
            bottom: 0,
            left: "-25%",
            width: "150%",
            height: "800px",
            backgroundImage:
              "linear-gradient(rgba(0,0,0,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.035) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
            transform: "rotateX(75deg)",
            transformOrigin: "center bottom",
          }}
        />
      </div>

      {/* No floating particles: scattered glowing dots read as
          snowflakes rather than as brand. */}

      {/* Top bar: the same logo, in the same place, as every other page */}
      <AuthTopBar>
        <span>
          {t("login_chooser.new_to_vendora")}{" "}
          <Link
            to="/signup"
            className="font-medium pb-px"
            style={{ borderBottom: "0.5px solid #000" }}
          >
            {t("login_chooser.sign_up")}
          </Link>
        </span>
      </AuthTopBar>

      {/* Centered chooser */}
      <div
        className="relative z-[2] flex flex-col items-center justify-center px-6 md:px-10"
        style={{ minHeight: "720px", padding: "130px 40px 100px" }}
      >
        {/* Pulse pill */}
        <div
          className="inline-flex items-center gap-2.5 rounded-full px-4 py-1.5 mb-7"
          style={{
            border: "0.5px solid rgba(0,0,0,0.7)",
            background: "rgba(255,255,255,0.55)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          <span
            className="login-pulse rounded-full"
            style={{
              width: 6,
              height: 6,
              background: "#18181b",
              boxShadow: "0 0 8px rgba(0,0,0,0.25)",
            }}
          />
          <span
            className="uppercase font-semibold text-black"
            style={{ fontSize: "11px", letterSpacing: "2.5px" }}
          >
            {t("login_chooser.pill")}
          </span>
        </div>

        <h1
          className="text-black m-0 text-center"
          style={{
            fontSize: "48px",
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: "-1.2px",
          }}
        >
          {t("login_chooser.title")}
        </h1>
        <h1
          className="font-editorial text-black mt-2 mb-4 text-center"
          style={{
            fontSize: "48px",
            lineHeight: 1.1,
            letterSpacing: "-0.8px",
          }}
        >
          {t("login_chooser.title_accent")}
        </h1>

        {/* Role cards */}
        <div
          className="w-full flex flex-col gap-3.5"
          style={{ maxWidth: "520px" }}
        >
          <RoleCard
            to="/login/host"
            icon={<CalendarHeart className="w-5 h-5" />}
            title={t("login_chooser.host_title")}
            subtitle={t("login_chooser.host_subtitle")}
          />
          <RoleCard
            to="/login/vendor"
            icon={<Briefcase className="w-5 h-5" />}
            title={t("login_chooser.vendor_title")}
            subtitle={t("login_chooser.vendor_subtitle")}
          />
        </div>

      </div>

      {/* Keyframes — namespaced to this surface */}
      <style>{`
        @keyframes loginGridScroll {
          0% { background-position: 0 0; }
          100% { background-position: 0 60px; }
        }
        .login-grid-scroll {
          animation: loginGridScroll 5s linear infinite;
        }
        @keyframes loginPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.6; }
        }
        .login-pulse {
          animation: loginPulse 1.6s ease-in-out infinite;
        }
        .login-card {
          transition: all 0.3s ease;
        }
        .login-card:hover {
          background: rgba(255,255,255,0.55) !important;
          border-color: rgba(0,0,0,0.6) !important;
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(0,0,0,0.12);
        }
      `}</style>
    </div>
  );
}

function RoleCard({
  to,
  icon,
  title,
  subtitle,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      to={to}
      className="login-card group flex items-center gap-4.5 cursor-pointer"
      style={{
        padding: "22px 24px",
        background: "rgba(255,255,255,0.35)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: "0.5px solid rgba(0,0,0,0.18)",
        borderRadius: "14px",
        gap: "18px",
      }}
    >
      <div
        className="flex items-center justify-center shrink-0"
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.5)",
          border: "0.5px solid rgba(0,0,0,0.15)",
        }}
      >
        {icon}
      </div>
      <div className="flex-1">
        <div
          className="font-editorial"
          style={{ fontSize: "20px", color: "#000", marginBottom: "3px" }}
        >
          {title}
        </div>
        <div style={{ fontSize: "12px", color: "#000", opacity: 0.65 }}>
          {subtitle}
        </div>
      </div>
      <div
        className="flex items-center justify-center shrink-0 transition-transform group-hover:translate-x-0.5"
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "0.5px solid rgba(0,0,0,0.25)",
        }}
      >
        <ArrowRight className="w-3.5 h-3.5" />
      </div>
    </Link>
  );
}

