// Shared glassy shell for the auth form pages (/login/host,
// /login/vendor, /signup/host, /signup/vendor, /forgot-password,
// /reset-password). Renders the canvas (AuthBackdrop: turning rings and
// grid floor on plain ink), the top bar, centered headline + subtitle, glassy form
// card, below-card link slot). Page-specific content (form fields,
// copy, role-specific labels) goes through props.
//
// Dark like the rest of the site (owner's call, Oct 2026): cream text,
// champagne accents, see-through card and fields, a gold submit pill.
//
// Deliberately undecorated: this used to scatter four-point stars and
// eight glowing drifting dots across the canvas, which read as
// snowflakes rather than as brand. Depth comes from the glows, grid
// and ring alone — keep it that way.

import { ReactNode } from "react";
import { AuthTopBar } from "@/components/auth/AuthTopBar";
import { AuthBackdrop } from "@/components/auth/AuthBackdrop";

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
      style={{ background: "transparent", color: "#f4f1ea" }}
    >
      <AuthBackdrop />

      {/* No star or drifting-particle decorations: scattered glowing
          dots plus four-point stars read as snowflakes, which is the
          wrong season and the wrong brand. The glows, grid and ring
          carry the depth on their own. */}

      {/* TOP BAR: the same logo, in the same place, as every other page */}
      <AuthTopBar>{topRight}</AuthTopBar>

      {/* MAIN */}
      <div
        className="relative z-[2] flex flex-col items-center justify-center"
        style={{ padding: "130px 40px 64px", minHeight: "100vh" }}
      >
        {/* Headlines */}
        <h1
          className="auth-headline text-foreground m-0 w-full text-center"
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
          className="auth-headline font-editorial text-foreground m-0 w-full text-center"
          style={{
            fontSize: "50px",
            fontWeight: 700,
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
          className="font-serif italic m-0 text-center mb-9"
          style={{ fontSize: "16px", opacity: 0.85 }}
        >
          {subtitle}
        </p>

        {/* GLASSY FORM CARD */}
        <div
          className="w-full"
          style={{
            maxWidth: "420px",
            background: "rgba(255,255,255,0.04)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.15)",
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
              borderBottom: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <span
              className="auth-pulse rounded-full"
              style={{
                width: 6,
                height: 6,
                background: "#c9a86a",
                boxShadow: "0 0 6px rgba(201,168,106,0.5)",
              }}
            />
            <span
              className="uppercase font-medium"
              style={{
                fontSize: "10px",
                letterSpacing: "2px",
                opacity: 0.85,
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
          background: linear-gradient(to right, transparent, #c9a86a, transparent);
        }
        /* Glassy form input — used by children forms */
        .auth-input {
          width: 100%;
          height: 44px;
          padding: 0 16px;
          background: rgba(255,255,255,0.05);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 12px;
          font-size: 14px;
          color: #f4f1ea;
          outline: none;
          transition: all 0.2s;
          font-family: inherit;
        }
        .auth-input:focus {
          border-color: rgba(201,168,106,0.8);
          background: rgba(255,255,255,0.08);
          box-shadow: 0 0 0 3px rgba(201,168,106,0.18);
        }
        .auth-input::placeholder {
          color: rgba(244,241,234,0.6);
        }
        .auth-submit {
          width: 100%;
          height: 46px;
          background: #c9a86a;
          color: #14161a;
          border: none;
          border-radius: 999px;
          font-size: 13px;
          letter-spacing: 0.3px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-family: inherit;
        }
        .auth-submit:hover:not(:disabled) {
          background: #bd9a5b;
        }
        .auth-submit:disabled {
          background: #e0d2b0;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

