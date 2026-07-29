import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { VendoraLogo } from "@/components/shared/VendoraLogo";
import { Picture } from "@/components/shared/Picture";
// vite-imagetools `?as=picture` (see vite.config.ts) → AVIF + WebP + JPG
// at 640/1024/1600, same pattern VendorCard uses for the browse grid.
import venues from "@/assets/vendor-venue.jpg?as=picture";
import foodBeverage from "@/assets/vendor-catering.jpg?as=picture";
import entertainment from "@/assets/vendor-dj.jpg?as=picture";
import media from "@/assets/vendor-photographer.jpg?as=picture";
import designDecor from "@/assets/vendor-florist.jpg?as=picture";
import experiences from "@/assets/vendor-makeup.jpg?as=picture";

// Six of the eight taxonomy groups — the ones with a dedicated photo.
// Slugs match categoryTaxonomy.ts so each tile deep-links into the real
// /vendors/category/:slug page rather than a generic browse view.
const CATEGORY_TILES = [
  { name: "Venues", slug: "venues", image: venues },
  { name: "Food & Beverage", slug: "food-beverage", image: foodBeverage },
  { name: "Entertainment", slug: "entertainment", image: entertainment },
  { name: "Media", slug: "media", image: media },
  { name: "Design & Decor", slug: "design-decor", image: designDecor },
  { name: "Experiences", slug: "experiences", image: experiences },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Browse",
    body: "Explore curated, verified vendors by category, city, and event type — with real portfolios, not stock photos.",
  },
  {
    step: "02",
    title: "Inquire",
    body: "Send your date and details to any vendor. Compare replies and quotes side by side in one inbox.",
  },
  {
    step: "03",
    title: "Book",
    body: "Lock in your vendor with a contract and secure payment, then track every detail through the big day.",
  },
];

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
          "linear-gradient(180deg, #ffffff 0%, #fafafa 35%, #f6f6f7 60%, #f2f2f3 80%, #efeff0 100%)",
      }}
    >
      {/* NAV */}
      <header className="relative z-30 flex items-center justify-between px-6 py-5 md:px-10 md:py-6">
        <Link to="/" aria-label="Vendora — Events, simplified">
          <VendoraLogo size="md" color="#000" />
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-[13px] text-black">
          <Link to="/vendors" className="hover:opacity-70 transition-opacity">
            Vendors
          </Link>
          <Link to="/explore" className="hover:opacity-70 transition-opacity">
            Explore
          </Link>
          <Link
            to="/website-builder"
            className="inline-flex items-center gap-1.5 hover:opacity-70 transition-opacity"
          >
            Website builder
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
      {/* Background intentionally left to the app-wide AmbientBackground
          (drifting navy glow) so the landing feels alive and consistent
          with the rest of the app instead of a flat monochrome wash. */}

      <div className="relative z-[1]">

        {/* HERO CONTENT */}
        <section className="relative z-[2] px-6 md:px-10 pt-20 pb-16 md:pt-24 md:pb-20 text-center">
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
            className="font-editorial italic text-black mt-2.5 mb-6"
            style={{
              fontSize: "60px",
              fontWeight: 500,
              lineHeight: 1.05,
              letterSpacing: "-1px",
            }}
          >
            with Vendora.
          </h1>
          <p className="text-black/55 text-base md:text-lg max-w-xl mx-auto mb-8 leading-relaxed">
            Browse curated, verified vendors — photographers, caterers, venues,
            and more — and book the ones that fit your celebration.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/vendors"
              className="bg-black text-white rounded-full px-6 py-3 text-sm font-medium hover:bg-black/90 transition-colors"
            >
              Browse vendors
            </Link>
            <Link
              to="/signup/vendor"
              className="rounded-full px-6 py-3 text-sm font-medium border border-black/15 text-black hover:bg-black/[0.04] transition-colors"
            >
              List your business
            </Link>
          </div>
        </section>

        {/* CATEGORY TILES — the page's main visual surface. Each tile is a
            real deep link into /vendors/category/:slug, so this doubles as
            navigation rather than decoration. */}
        <section className="relative z-[2] px-6 md:px-10 pb-20 md:pb-28">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-baseline justify-between gap-4 mb-7">
              <h2
                className="font-editorial italic text-black m-0 text-[28px] md:text-[34px]"
                style={{ lineHeight: 1.1, letterSpacing: "-0.5px" }}
              >
                Browse by category
              </h2>
              <Link
                to="/vendors"
                className="text-[13px] text-black/55 hover:text-black transition-colors whitespace-nowrap"
              >
                View all →
              </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
              {CATEGORY_TILES.map((tile) => (
                <Link
                  key={tile.slug}
                  to={`/vendors/category/${tile.slug}`}
                  className="group relative overflow-hidden rounded-2xl bg-black/[0.04] aspect-[4/3] md:aspect-[3/2]"
                >
                  <Picture
                    source={tile.image}
                    alt={tile.name}
                    loading="lazy"
                    sizes="(min-width: 768px) 33vw, 50vw"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                  />
                  {/* Bottom scrim keeps the label legible on any photo. */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%)",
                    }}
                  />
                  <span className="absolute left-4 bottom-3.5 text-white text-[14px] md:text-[15px] font-medium tracking-tight">
                    {tile.name}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS — answers "what is this?" for first-time visitors,
            which a bare hero leaves open. */}
        <section className="relative z-[2] px-6 md:px-10 pb-20 md:pb-28">
          <div className="max-w-5xl mx-auto">
            <h2
              className="font-editorial italic text-black m-0 mb-8 text-[28px] md:text-[34px]"
              style={{ lineHeight: 1.1, letterSpacing: "-0.5px" }}
            >
              How it works
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
              {HOW_IT_WORKS.map((item) => (
                <div key={item.step}>
                  <div
                    className="text-[11px] text-black/40 mb-3 font-medium"
                    style={{ letterSpacing: "2px" }}
                  >
                    {item.step}
                  </div>
                  <div className="text-black text-[17px] font-medium mb-2">
                    {item.title}
                  </div>
                  <p className="text-black/55 text-[14px] leading-relaxed m-0">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
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
