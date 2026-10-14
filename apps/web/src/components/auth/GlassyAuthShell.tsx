// Shared shell for the auth form pages (/login/host, /login/vendor,
// /signup/host, /signup/vendor, /forgot-password, /reset-password,
// /check-email). Kept simple (owner's call, Oct 2026): the site's top
// menu, then a title, a subtitle and the form straight on the plain ink
// page, with no rings, glows or card around it. Page-specific content
// (form fields, copy, role-specific labels) goes through props. The
// .auth-input / .auth-submit classes below style the forms' fields and
// gold submit pill.

import { ReactNode } from "react";
import { AuthSplitLayout } from "@/components/auth/AuthSplitLayout";

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
  /** Which welcome the photo side shows (sign-up pages pass "signup"). */
  side?: "signin" | "signup";
  /** Form fields go inside the glassy form card. */
  children: ReactNode;
}

export function GlassyAuthShell({
  title,
  titleAccent,
  subtitle,
  // pillLabel: kept so callers compile; the simple layout has no pill.
  topRight,
  belowCardLink,
  side = "signin",
  children,
}: Props) {
  return (
    <AuthSplitLayout side={side}>
      <div>
        <h1 className="auth-headline m-0 text-[32px] md:text-[40px] leading-[1.1]" style={{ letterSpacing: "-0.5px" }}>
          {title} <span className="text-gold">{titleAccent}</span>
        </h1>
        <p className="m-0 mt-3 mb-8 text-[15px] text-[#f4f1ea]/80">{subtitle}</p>

        {/* The form sits straight on the page: no card around it. */}
        {children}

        {belowCardLink && <div className="mt-8 flex flex-col gap-1.5 text-[14px]">{belowCardLink}</div>}
        <div className="mt-3 text-[14px] text-[#f4f1ea]/80">{topRight}</div>
      </div>
      {/* KEYFRAMES — namespaced to the auth shell */}
      <style>{`
        /* Form input — used by children forms */
        .auth-input {
          width: 100%;
          height: 44px;
          padding: 0 16px;
          background: rgba(255,255,255,0.05);
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
    </AuthSplitLayout>
  );
}


