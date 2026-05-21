import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

// Landing page. Warm cream → peach gradient canvas with a single
// fixed-position amber radial glow that acts as the real page
// backdrop — the glow doesn't scroll with the hero, so the page
// reads as one continuous shade top-to-bottom instead of an orange
// "image" floating in the middle of a white page. Nav and footer
// are inlined here (rather than using PublicNav/Footer) so the
// marketing surface keeps its bespoke styling — the rest of the
// public site still uses the shared chrome.
export default function LandingPage() {
  const { session, hasVendorAccess, hasHostAccess } = useAuth();
  // Authenticated users land on / after email confirmation. Surface a
  // single CTA that bounces them into the right portal. Pure
  // vendor-only accounts can't access host pages and vice versa, so
  // we route per the role flag set by handle_new_user.
  const portalPath = hasVendorAccess
    ? "/vendor/me"
    : hasHostAccess
      ? "/customer/explore"
      : null;
  return (
    <div
      className="min-h-screen text-black"
      style={{
        // Continuous shade — soft off-white at top, gently warming into
        // a peach tint that the amber-glow ellipse blends into, so
        // hero and footer sit on one canvas with no visible seam.
        background:
          "linear-gradient(180deg, #fafafa 0%, #fcf6ec 35%, #fbf0df 60%, #faecd6 80%, #f8e7cd 100%)",
      }}
    >
      {/* NAV */}
      <header className="relative z-30 flex items-center justify-between px-6 py-5 md:px-10 md:py-6">
        <Link to="/" className="font-editorial text-[22px] italic text-black">
          Vendora
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-[13px] text-black">
          <Link to="/vendors" className="hover:opacity-70 transition-opacity">
            Vendors
          </Link>
          <Link to="/explore" className="hover:opacity-70 transition-opacity">
            Explore
          </Link>
          <Link
            to="/super-agents"
            className="inline-flex items-center gap-1.5 hover:opacity-70 transition-opacity"
          >
            Super agents
            <span
              className="text-[9px] tracking-widest rounded-full px-1.5 py-px text-black"
              style={{ border: "0.5px solid #000" }}
            >
              NEW
            </span>
          </Link>
        </nav>
        <div className="flex items-center gap-5 text-[13px]">
          {session && portalPath ? (
            <Link
              to={portalPath}
              className="bg-black text-white rounded-full px-5 py-2.5 hover:bg-black/90 transition-colors"
            >
              Open dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="text-black hover:opacity-70 transition-opacity">
                Log in
              </Link>
              <Link
                to="/signup"
                className="bg-black text-white rounded-full px-5 py-2.5 hover:bg-black/90 transition-colors"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </header>

      {/* HERO + footer share one continuous canvas. The ambient
          amber glow lives on the body itself (fixed-position so it's
          a real page backdrop, not a scrolling block that reads as
          a floating image when you scroll past it). Previous version
          used absolute-positioned blobs scoped to a wrapper, which
          stopped at the hero's natural height and left the rest of
          the page reading as a separate flat section. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 70% at 50% 35%, rgba(255,138,76,0.22) 0%, rgba(255,138,76,0.08) 45%, rgba(255,138,76,0) 75%)",
        }}
      />

      <div className="relative z-[1]">

        {/* HERO CONTENT */}
        <section className="relative z-[2] px-6 md:px-10 pt-24 pb-24 md:pt-28 md:pb-28 text-center">
          <div
            className="inline-flex items-center gap-2.5 rounded-full px-4 py-1.5 mb-8"
            style={{
              border: "0.5px solid rgba(255,138,76,0.7)",
              background: "rgba(255,255,255,0.7)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
            }}
          >
            <span
              className="landing-hero-pulse rounded-full"
              style={{
                width: 6,
                height: 6,
                background: "#ff8a4c",
                boxShadow: "0 0 8px #ff8a4c",
              }}
            />
            <span
              className="uppercase font-semibold text-black"
              style={{
                fontSize: "11px",
                letterSpacing: "2.5px",
              }}
            >
              Now with Super Agents powered by Opus 4.7
            </span>
          </div>

          <h1
            className="text-black m-0"
            style={{
              fontSize: "60px",
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-1.5px",
            }}
          >
            Book your next event
          </h1>
          <h1
            className="font-editorial italic text-black mt-2.5 mb-9"
            style={{
              fontSize: "60px",
              fontWeight: 500,
              lineHeight: 1.05,
              letterSpacing: "-1px",
            }}
          >
            with Vendora.
          </h1>
        </section>

      </div>

      {/* FOOTER */}
      <footer className="relative z-[1] px-6 md:px-10 pt-16 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr] gap-10 mb-12 max-w-6xl mx-auto">
          {/* Brand column */}
          <div>
            <div className="font-editorial italic text-[22px] text-black mb-2.5">
              Vendora
            </div>
            <div className="text-[13px] text-black mb-4 leading-relaxed">
              Every detail, perfectly composed.
            </div>
            <div
              className="inline-flex items-center gap-2 text-[10px] uppercase text-black rounded-full px-3 py-1.5"
              style={{ border: "0.5px solid #000", letterSpacing: "1.5px" }}
            >
              <span
                className="rounded-full"
                style={{
                  width: 5,
                  height: 5,
                  background: "#ff8a4c",
                  boxShadow: "0 0 6px #ff8a4c",
                }}
              />
              Powered by Opus 4.7
            </div>
          </div>

          {/* Vendors column */}
          <div>
            <div
              className="text-[10px] uppercase text-black mb-4 font-medium"
              style={{ letterSpacing: "2px" }}
            >
              Vendors
            </div>
            <ul className="text-[13px] text-black space-y-2.5">
              <li>
                <Link to="/vendors" className="hover:opacity-70 transition-opacity">
                  Browse all
                </Link>
              </li>
              <li>
                <Link to="/vendors/locations" className="hover:opacity-70 transition-opacity">
                  By location
                </Link>
              </li>
              <li>
                <Link to="/explore" className="hover:opacity-70 transition-opacity">
                  Explore
                </Link>
              </li>
              <li>
                <Link to="/signup/vendor" className="hover:opacity-70 transition-opacity">
                  For vendors
                </Link>
              </li>
            </ul>
          </div>

          {/* Company column */}
          <div>
            <div
              className="text-[10px] uppercase text-black mb-4 font-medium"
              style={{ letterSpacing: "2px" }}
            >
              Company
            </div>
            <ul className="text-[13px] text-black space-y-2.5">
              <li>
                <Link to="/changelog" className="hover:opacity-70 transition-opacity">
                  Changelog
                </Link>
              </li>
              <li>
                <Link to="/press" className="hover:opacity-70 transition-opacity">
                  Press
                </Link>
              </li>
              <li>
                <Link to="/status" className="hover:opacity-70 transition-opacity">
                  Status
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal column */}
          <div>
            <div
              className="text-[10px] uppercase text-black mb-4 font-medium"
              style={{ letterSpacing: "2px" }}
            >
              Legal
            </div>
            <ul className="text-[13px] text-black space-y-2.5">
              <li>
                <Link to="/privacy" className="hover:opacity-70 transition-opacity">
                  Privacy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="hover:opacity-70 transition-opacity">
                  Terms
                </Link>
              </li>
              <li>
                <a
                  href="mailto:hello@vendora.events"
                  className="hover:opacity-70 transition-opacity"
                >
                  hello@vendora.events
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom row */}
        <div
          className="max-w-6xl mx-auto pt-6 flex flex-wrap items-center justify-between gap-3"
          style={{ borderTop: "0.5px solid rgba(0,0,0,0.15)" }}
        >
          <div className="text-[11px] text-black">© 2026 Vendora. All rights reserved.</div>
          <div className="flex gap-5 text-[12px] text-black">
            <a
              href="https://instagram.com/eventvendora"
              target="_blank"
              rel="noreferrer noopener"
              className="hover:opacity-70 transition-opacity"
            >
              @eventvendora · Instagram
            </a>
            <a
              href="https://tiktok.com/@eventvendora"
              target="_blank"
              rel="noreferrer noopener"
              className="hover:opacity-70 transition-opacity"
            >
              @eventvendora · TikTok
            </a>
            <a
              href="https://facebook.com/eventvendora"
              target="_blank"
              rel="noreferrer noopener"
              className="hover:opacity-70 transition-opacity"
            >
              /eventvendora · Facebook
            </a>
          </div>
        </div>
      </footer>

      {/* Keyframes — kept inline because they're specific to this page
          and the grid/particle animations don't reuse anywhere else. */}
      <style>{`
        @keyframes landingHeroPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.6; }
        }
        .landing-hero-pulse {
          animation: landingHeroPulse 1.6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
