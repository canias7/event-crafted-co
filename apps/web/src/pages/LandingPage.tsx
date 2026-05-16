import { Link } from "react-router-dom";

// Landing page. Pure white canvas, italic-serif wordmark, amber-glow
// hero with an animated perspective grid + floating particles, then
// a Featured vendors strip and a full-column footer. The nav and
// footer are inlined here (rather than using PublicNav/Footer) so
// the marketing surface keeps its bespoke styling — the rest of the
// public site still uses the shared chrome.
//
// Animations live in a single <style> block at the bottom of the
// component. Keyframe names are namespaced (`landing-...`) so they
// don't collide with anything else in the bundle.
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#fafafa] text-black">
      {/* NAV */}
      <header className="relative z-30 flex items-center justify-between bg-[#fafafa] px-6 py-5 md:px-10 md:py-6">
        <Link to="/" className="font-editorial text-[22px] italic text-black">
          Vendora
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-[13px] text-black">
          <Link to="/vendors" className="hover:opacity-70 transition-opacity">
            Vendors
          </Link>
          <Link to="/real-events" className="hover:opacity-70 transition-opacity">
            Real events
          </Link>
          <span className="inline-flex items-center gap-1.5">
            Super agents
            <span
              className="text-[9px] tracking-widest rounded-full px-1.5 py-px text-black"
              style={{ border: "0.5px solid #000" }}
            >
              NEW
            </span>
          </span>
        </nav>
        <div className="flex items-center gap-5 text-[13px]">
          <Link to="/login" className="text-black hover:opacity-70 transition-opacity">
            Log in
          </Link>
          <Link
            to="/signup"
            className="bg-black text-white rounded-full px-5 py-2.5 hover:bg-black/90 transition-colors"
          >
            Sign up
          </Link>
        </div>
      </header>

      {/* HERO + VENDORS share one canvas so the glow + grid sit
          continuously underneath both sections. */}
      <div className="relative bg-[#fafafa] overflow-hidden">
        {/* Ambient amber glow centered behind the hero */}
        <div
          aria-hidden
          className="pointer-events-none absolute z-0"
          style={{
            top: "200px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "1100px",
            height: "700px",
            background:
              "radial-gradient(ellipse at center, rgba(255,138,76,0.30) 0%, rgba(255,138,76,0.10) 30%, rgba(255,138,76,0.03) 55%, transparent 75%)",
          }}
        />

        {/* Perspective grid plane, animating "into" the horizon */}
        <div
          aria-hidden
          className="pointer-events-none absolute z-0 inset-x-0"
          style={{
            top: "380px",
            height: "360px",
            perspective: "700px",
            overflow: "hidden",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0%, #000 25%, #000 60%, transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0%, #000 25%, #000 60%, transparent 100%)",
          }}
        >
          <div
            className="landing-grid-scroll"
            style={{
              position: "absolute",
              bottom: 0,
              left: "-25%",
              width: "150%",
              height: "600px",
              backgroundImage:
                "linear-gradient(rgba(255,138,76,0.32) 1px, transparent 1px), linear-gradient(90deg, rgba(255,138,76,0.32) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
              transform: "rotateX(74deg)",
              transformOrigin: "center bottom",
            }}
          />
        </div>

        {/* Floating amber particles */}
        <span
          aria-hidden
          className="landing-float-a absolute z-[1] rounded-full"
          style={{
            top: "220px",
            left: "14%",
            width: 3,
            height: 3,
            background: "#ff8a4c",
            boxShadow: "0 0 8px #ff8a4c",
          }}
        />
        <span
          aria-hidden
          className="landing-float-b absolute z-[1] rounded-full"
          style={{
            top: "340px",
            right: "18%",
            width: 2,
            height: 2,
            background: "#ffb27a",
            boxShadow: "0 0 6px #ffb27a",
            animationDelay: "1s",
          }}
        />
        <span
          aria-hidden
          className="landing-float-a absolute z-[1] rounded-full"
          style={{
            top: "420px",
            left: "22%",
            width: 2,
            height: 2,
            background: "#ff8a4c",
            boxShadow: "0 0 6px #ff8a4c",
            animationDelay: "2s",
          }}
        />
        <span
          aria-hidden
          className="landing-float-b absolute z-[1] rounded-full"
          style={{
            top: "280px",
            right: "12%",
            width: 3,
            height: 3,
            background: "#ffb27a",
            boxShadow: "0 0 8px #ffb27a",
            animationDelay: "0.5s",
          }}
        />
        <span
          aria-hidden
          className="landing-float-a absolute z-[1] rounded-full"
          style={{
            top: "500px",
            right: "28%",
            width: 2,
            height: 2,
            background: "#ff8a4c",
            boxShadow: "0 0 6px #ff8a4c",
            animationDelay: "1.5s",
          }}
        />

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
          <div className="mx-auto" style={{ width: 48, height: "0.5px", background: "#000" }} />
        </section>

      </div>

      {/* FOOTER */}
      <footer className="px-6 md:px-10 pt-16 pb-8 bg-[#fafafa]">
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
                <Link to="/real-events" className="hover:opacity-70 transition-opacity">
                  Real events
                </Link>
              </li>
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
        @keyframes landingGridScroll {
          0% { background-position: 0 0; }
          100% { background-position: 0 56px; }
        }
        .landing-grid-scroll {
          animation: landingGridScroll 5s linear infinite;
        }
        @keyframes landingFloatA {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-28px); opacity: 1; }
        }
        .landing-float-a {
          animation: landingFloatA 6s ease-in-out infinite;
        }
        @keyframes landingFloatB {
          0%, 100% { transform: translateY(0); opacity: 0.5; }
          50% { transform: translateY(-22px); opacity: 1; }
        }
        .landing-float-b {
          animation: landingFloatB 7s ease-in-out infinite;
        }
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
