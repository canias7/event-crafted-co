// Shared glassy shell for the auth form pages (/login/host,
// /login/vendor, /signup/host, /signup/vendor, /forgot-password,
// /reset-password). Renders the canvas (soft glows, perspective grid,
// orbital ring, top bar, centered headline + subtitle, glassy form
// card, below-card link slot). Page-specific content (form fields,
// copy, role-specific labels) goes through props.
//
// Deliberately undecorated: this used to scatter four-point stars and
// eight glowing drifting dots across the canvas, which read as
// snowflakes rather than as brand. Depth comes from the glows, grid
// and ring alone — keep it that way.

import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { VendoraLogo } from "@/components/shared/VendoraLogo";

interface Props {
  /** Sans-serif headline (e.g. "Welcome back,") */
  title: string;
  /** Italic-serif accent (e.g. "host."). Gets the amber underline shimmer. */
  titleAccent: string;
  /** Subtitle below the headlines (italic serif). */
  subtitle: string;
  /** Uppercase pill label centered at the top of the form card. */
  pillLabel: string;
  /** Top-right slot — usually "Need help?" + a Sign in/up link. */
  topRight: ReactNode;
  /** Below-card link slot — usually "On the other side? ..." */
  belowCardLink?: ReactNode;
  /** Form fields go inside the glassy form card. */
  children: ReactNode;
}

export function GlassyAuthShell({
  title,
  titleAccent,
  subtitle,
  pillLabel,
  topRight,
  belowCardLink,
  children,
}: Props) {
  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ background: "transparent", color: "#000" }}
    >
      {/* GLOWS */}
      <div
        aria-hidden
        className="pointer-events-none absolute z-0"
        style={{
          top: "32%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "1100px",
          height: "850px",
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.012) 0%, rgba(0,0,0,0.007) 32%, rgba(0,0,0,0.004) 58%, transparent 78%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute z-0"
        style={{
          bottom: "-120px",
          right: "-8%",
          width: "680px",
          height: "580px",
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.012) 0%, rgba(0,0,0,0.007) 42%, transparent 72%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute z-0"
        style={{
          top: "65%",
          left: "-8%",
          width: "480px",
          height: "480px",
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.01) 0%, transparent 65%)",
        }}
      />

      {/* GRID FLOOR */}
      <div
        aria-hidden
        className="pointer-events-none absolute z-0 inset-x-0"
        style={{
          bottom: 0,
          height: "380px",
          perspective: "800px",
          overflow: "hidden",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, #000 38%, #000 100%)",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, #000 38%, #000 100%)",
        }}
      >
        <div
          className="auth-grid-scroll"
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

      {/* SLOWLY-ROTATING ORBITAL RING */}
      <div
        aria-hidden
        className="auth-ring pointer-events-none absolute z-0"
        style={{
          top: "50%",
          left: "50%",
          width: "640px",
          height: "640px",
          border: "0.5px dashed rgba(0,0,0,0.045)",
          borderRadius: "50%",
        }}
      />

      {/* No star or drifting-particle decorations: scattered glowing
          dots plus four-point stars read as snowflakes, which is the
          wrong season and the wrong brand. The glows, grid and ring
          carry the depth on their own. */}

      {/* TOP BAR */}
      <div
        className="absolute top-0 left-0 right-0 z-[3] flex items-center justify-between"
        style={{ padding: "28px 40px" }}
      >
        <div className="flex items-center gap-3.5">
          <Link to="/" aria-label="Vendora — Events, simplified">
            <VendoraLogo size="md" color="#000" />
          </Link>
          <div
            style={{
              width: "0.5px",
              height: "18px",
              background: "rgba(0,0,0,0.2)",
            }}
          />
          <div
            className="uppercase"
            style={{
              fontSize: "10px",
              letterSpacing: "2px",
              opacity: 0.55,
            }}
          >
            Event marketplace
          </div>
        </div>
        <div className="flex items-center gap-6 text-[13px]">
          {topRight}
        </div>
      </div>

      {/* MAIN */}
      <div
        className="relative z-[2] flex flex-col items-center justify-center"
        style={{ padding: "130px 40px 64px", minHeight: "100vh" }}
      >
        {/* Headlines */}
        <h1
          className="text-black m-0 text-center"
          style={{
            fontSize: "46px",
            fontWeight: 700,
            lineHeight: 1.02,
            letterSpacing: "-1.2px",
            marginBottom: "2px",
          }}
        >
          {title}
        </h1>
        <h1
          className="font-editorial italic text-black m-0 text-center"
          style={{
            fontSize: "50px",
            fontWeight: 500,
            lineHeight: 1.02,
            letterSpacing: "-0.7px",
            marginBottom: "16px",
          }}
        >
          <span className="auth-underline-shimmer relative inline-block">
            {titleAccent}
          </span>
        </h1>
        <p
          className="font-editorial italic m-0 text-center mb-9"
          style={{ fontSize: "16px", opacity: 0.7 }}
        >
          {subtitle}
        </p>

        {/* GLASSY FORM CARD */}
        <div
          className="w-full"
          style={{
            maxWidth: "420px",
            background: "rgba(255,255,255,0.4)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "0.5px solid rgba(0,0,0,0.15)",
            borderRadius: "18px",
            padding: "28px 28px 24px",
          }}
        >
          {/* Pill header */}
          <div
            className="flex items-center justify-center"
            style={{
              gap: "8px",
              marginBottom: "22px",
              paddingBottom: "18px",
              borderBottom: "0.5px solid rgba(0,0,0,0.08)",
            }}
          >
            <span
              className="auth-pulse rounded-full"
              style={{
                width: 6,
                height: 6,
                background: "#18181b",
                boxShadow: "0 0 6px rgba(0,0,0,0.25)",
              }}
            />
            <span
              className="uppercase font-medium"
              style={{
                fontSize: "10px",
                letterSpacing: "2px",
                opacity: 0.75,
              }}
            >
              {pillLabel}
            </span>
          </div>

          {children}
        </div>

        {belowCardLink && (
          <div
            className="text-center flex flex-col gap-1.5"
            style={{ marginTop: "24px", fontSize: "13px" }}
          >
            {belowCardLink}
          </div>
        )}

      </div>

      {/* KEYFRAMES — namespaced to the auth shell */}
      <style>{`
        @keyframes authGridScroll {
          0% { background-position: 0 0; }
          100% { background-position: 0 60px; }
        }
        .auth-grid-scroll {
          animation: authGridScroll 5s linear infinite;
        }
        @keyframes authRotSlow {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        .auth-ring {
          animation: authRotSlow 80s linear infinite;
        }
        @keyframes authPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.6; }
        }
        .auth-pulse {
          animation: authPulse 1.6s ease-in-out infinite;
        }
        .auth-underline-shimmer::after {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          bottom: -2px;
          height: 0.5px;
          background: linear-gradient(to right, transparent, #18181b, transparent);
        }
        /* Glassy form input — used by children forms */
        .auth-input {
          width: 100%;
          height: 44px;
          padding: 0 16px;
          background: rgba(255,255,255,0.55);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 0.5px solid rgba(0,0,0,0.15);
          border-radius: 10px;
          font-size: 14px;
          color: #000;
          outline: none;
          transition: all 0.2s;
          font-family: inherit;
        }
        .auth-input:focus {
          border-color: rgba(0,0,0,0.65);
          background: rgba(255,255,255,0.75);
          box-shadow: 0 0 0 3px rgba(0,0,0,0.08);
        }
        .auth-input::placeholder {
          color: rgba(0,0,0,0.35);
        }
        .auth-submit {
          width: 100%;
          height: 46px;
          background: #000;
          color: #fff;
          border: none;
          border-radius: 999px;
          font-size: 13px;
          letter-spacing: 0.3px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-family: inherit;
          box-shadow: 0 4px 20px rgba(0,0,0,0.18);
        }
        .auth-submit:hover:not(:disabled) {
          background: #1a1a1a;
          box-shadow: 0 6px 28px rgba(0,0,0,0.3);
          transform: translateY(-1px);
        }
        .auth-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

