// Sign-in role chooser. /login lands here; user picks Host or Vendor
// and we forward to /login/host or /login/vendor. Adapted from the
// new glassy-amber-grid design — same canvas as the landing page so
// the auth surface reads as one continuous brand world.

import { Link, Navigate } from "react-router-dom";
import { CalendarHeart, Briefcase, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function LoginRoleChooserPage() {
  // Already authenticated? Skip the chooser and drop them in the
  // portal they belong to. (Catches users who hit /login from an
  // old tab while already signed in elsewhere.)
  const { session, hasVendorAccess, hasHostAccess, loading } = useAuth();
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
              "linear-gradient(rgba(0,0,0,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.08) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
            transform: "rotateX(75deg)",
            transformOrigin: "center bottom",
          }}
        />
      </div>

      {/* Floating particles */}
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          aria-hidden
          className={p.variant === "a" ? "login-float-a" : "login-float-b"}
          style={{
            position: "absolute",
            top: p.top,
            left: p.left,
            right: p.right,
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: `0 0 ${p.glow}px ${p.color}`,
            borderRadius: "50%",
            zIndex: 1,
            animationDelay: p.delay,
          }}
        />
      ))}

      {/* Top-left wordmark */}
      <Link
        to="/"
        className="absolute z-[3] font-editorial italic"
        style={{ top: "32px", left: "40px", fontSize: "26px", color: "#000" }}
      >
        Vendora
      </Link>

      {/* Top-right new-account CTA */}
      <div
        className="absolute z-[3] text-[13px]"
        style={{ top: "36px", right: "40px", color: "#000" }}
      >
        New to Vendora?{" "}
        <Link
          to="/signup"
          className="font-medium pb-px"
          style={{ borderBottom: "0.5px solid #000" }}
        >
          Sign up
        </Link>
      </div>

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
            Welcome back
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
          Sign in
        </h1>
        <h1
          className="font-editorial italic text-black mt-2 mb-4 text-center"
          style={{
            fontSize: "48px",
            fontWeight: 500,
            lineHeight: 1.1,
            letterSpacing: "-0.8px",
          }}
        >
          to Vendora.
        </h1>

        {/* Role cards */}
        <div
          className="w-full flex flex-col gap-3.5"
          style={{ maxWidth: "520px" }}
        >
          <RoleCard
            to="/login/host"
            icon={<CalendarHeart className="w-5 h-5" />}
            title="Host sign in"
            subtitle="Plan events, message vendors, manage your inquiries."
          />
          <RoleCard
            to="/login/vendor"
            icon={<Briefcase className="w-5 h-5" />}
            title="Vendor sign in"
            subtitle="Manage your listing, inquiries, and partner threads."
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
        @keyframes loginFloatA {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-30px); opacity: 1; }
        }
        .login-float-a {
          animation: loginFloatA 6s ease-in-out infinite;
        }
        @keyframes loginFloatB {
          0%, 100% { transform: translateY(0); opacity: 0.5; }
          50% { transform: translateY(-24px); opacity: 1; }
        }
        .login-float-b {
          animation: loginFloatB 7s ease-in-out infinite;
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
          className="font-editorial italic"
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

type Particle = {
  variant: "a" | "b";
  top?: string;
  left?: string;
  right?: string;
  size: number;
  color: string;
  glow: number;
  delay: string;
};

const PARTICLES: Particle[] = [
  { variant: "a", top: "20%", left: "10%", size: 3, color: "#18181b", glow: 10, delay: "0s" },
  { variant: "b", top: "35%", left: "28%", size: 2, color: "#71717a", glow: 6, delay: "1s" },
  { variant: "a", top: "60%", left: "18%", size: 2, color: "#18181b", glow: 6, delay: "2s" },
  { variant: "b", top: "25%", right: "30%", size: 3, color: "#71717a", glow: 8, delay: "0.5s" },
  { variant: "a", top: "50%", left: "8%", size: 2, color: "#18181b", glow: 6, delay: "1.5s" },
  { variant: "b", top: "75%", right: "20%", size: 2, color: "#71717a", glow: 6, delay: "2.5s" },
  { variant: "a", top: "15%", right: "12%", size: 3, color: "#18181b", glow: 10, delay: "1s" },
];
