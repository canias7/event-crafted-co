import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  CreditCard,
  FileText,
  Heart,
  MapPin,
  MessageCircle,
  Search,
  Star,
  Store,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useVendors } from "@/hooks/useVendors";
import { VendoraLogo } from "@/components/shared/VendoraLogo";
import { StudioVerifiedBadge } from "@/components/vendor/StudioVerifiedBadge";
import { Picture } from "@/components/shared/Picture";
// vite-imagetools `?as=picture` (see vite.config.ts) → AVIF + WebP + JPG
// at 640/1024/1600, same pattern VendorCard uses for the browse grid.
import heroCinematic from "@/assets/vendora-hero-cinematic.jpg?as=picture";
import heroDinner from "@/assets/vendora-hero-dinner.jpg?as=picture";
import heroNye from "@/assets/hero/nye.jpg?as=picture";
import venues from "@/assets/vendor-venue.jpg?as=picture";
import media from "@/assets/vendor-photographer.jpg?as=picture";
import designDecor from "@/assets/vendor-florist.jpg?as=picture";
import weddingImg from "@/assets/hero/wedding.jpg?as=picture";

// ── Palette (matches the mobile apps) ──────────────────────────────
const INK = "#14161a";
const CREAM = "#f4f1ea";
const GOLD = "#c9a86a";
const BRONZE = "#8a6f3e";

const POPULAR_SEARCHES = [
  { label: "Wedding venues", to: "/vendors?category=venues" },
  { label: "Photographers", to: "/vendors?q=photographer" },
  { label: "Caterers", to: "/vendors?category=food-beverage" },
  { label: "DJs", to: "/vendors?q=dj" },
  { label: "Rentals", to: "/vendors?q=rentals" },
  { label: "Party planners", to: "/vendors?q=planner" },
];

const HOST_STEPS = [
  {
    n: "1",
    title: "Discover",
    body: "Find the perfect vendors for your unique vision.",
    image: venues,
  },
  {
    n: "2",
    title: "Connect",
    body: "Message, compare, and get custom quotes.",
    image: media,
  },
  {
    n: "3",
    title: "Plan",
    body: "Keep every detail, timeline, and inspiration in one beautiful place.",
    image: designDecor,
  },
  {
    n: "4",
    title: "Book",
    body: "Secure your vendors and relax, knowing you're in good hands.",
    image: weddingImg,
  },
];

const EVENT_TYPES = [
  "Weddings",
  "Birthdays",
  "Corporate events",
  "Parties & celebrations",
  "Social gatherings",
  "and more…",
];

const VENDOR_STEPS = [
  {
    n: "1",
    title: "Get discovered",
    body: "Be seen by people actively planning events like yours.",
  },
  {
    n: "2",
    title: "Manage inquiries",
    body: "Respond, chat, and share proposals all in one inbox.",
  },
  {
    n: "3",
    title: "Book clients",
    body: "Secure bookings with contracts, payments, and automations.",
  },
  {
    n: "4",
    title: "Grow your business",
    body: "Track performance, collect reviews, and build your brand.",
  },
];

const TOOLS = [
  { icon: Search, title: "Smart search", body: "Find the right vendors faster." },
  { icon: MessageCircle, title: "Messaging", body: "All conversations in one place." },
  { icon: CalendarDays, title: "Availability", body: "Real-time calendars and scheduling." },
  { icon: FileText, title: "Quotes & proposals", body: "Compare and decide with confidence." },
  { icon: CreditCard, title: "Contracts & payments", body: "Secure, seamless, and stress-free." },
  { icon: Star, title: "Reviews", body: "Real feedback from real clients." },
];

// Landing page — the immersive, luxury-editorial experience per the
// reference mock: cinematic full-bleed hero with a real search bar,
// split host / vendor journeys (ivory then charcoal), an emotional
// connection band, the tools grid, a dark closing CTA, and a premium
// dark footer. Ivory / charcoal / champagne-gold throughout — shared
// with the mobile apps. Nav and footer stay inlined so this marketing
// surface keeps its bespoke styling.
export default function LandingPage() {
  const navigate = useNavigate();
  const { session, hasVendorAccess, hasHostAccess } = useAuth();
  const { vendors } = useVendors();
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState("");

  const portalPath = hasVendorAccess
    ? "/vendor/me"
    : hasHostAccess
      ? "/customer/explore"
      : null;

  // Floating hero card — a REAL vendor (verified first, most reviewed),
  // so the "premium marketplace" promise is a live listing, not a prop.
  const featured = [...vendors]
    .sort(
      (a, b) =>
        Number(b.studioVerified) - Number(a.studioVerified) ||
        b.reviews - a.reviews,
    )
    .find((v) => v.name);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (loc.trim()) params.set("location", loc.trim());
    navigate(`/vendors${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <div className="min-h-screen text-foreground" style={{ backgroundColor: CREAM }}>
      {/* ═══════════════ HERO — cinematic full-bleed ═══════════════ */}
      <section className="relative overflow-hidden" style={{ backgroundColor: INK }}>
        {/* Backdrop photo + slow drift */}
        <div className="absolute inset-0 landing-kenburns">
          <Picture
            source={heroCinematic}
            alt=""
            sizes="100vw"
            className="h-full w-full object-cover"
          />
        </div>
        {/* Scrims — readable text, luxe vignette */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(10,11,14,0.62) 0%, rgba(10,11,14,0.35) 38%, rgba(10,11,14,0.55) 74%, rgba(16,14,10,0.92) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 90% 60% at 50% 42%, rgba(0,0,0,0) 40%, rgba(8,9,12,0.45) 100%)",
          }}
        />

        {/* NAV (overlaid) */}
        <header className="relative z-20 flex items-center justify-between px-6 py-5 md:px-12 md:py-7">
          <Link to="/" aria-label="Vendora">
            <VendoraLogo size="md" color={CREAM} withTagline />
          </Link>
          <nav
            className="hidden md:flex items-center gap-8 text-[13px]"
            style={{ color: "rgba(244,241,234,0.85)" }}
          >
            <Link to="/vendors" className="hover:text-white transition-colors">
              Vendors
            </Link>
            <Link to="/explore" className="hover:text-white transition-colors">
              Explore
            </Link>
            <a href="#how-it-works" className="hover:text-white transition-colors">
              How it works
            </a>
            <Link
              to="/website-builder"
              className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
            >
              Website builder
              <span
                className="text-[9px] tracking-widest rounded-full px-1.5 py-px"
                style={{ color: GOLD, border: `0.5px solid ${GOLD}` }}
              >
                NEW
              </span>
            </Link>
          </nav>
          <div className="flex items-center gap-3 text-[13px]">
            {session && portalPath ? (
              <Link
                to={portalPath}
                className="rounded-full px-5 py-2.5 font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: CREAM, color: INK }}
              >
                Open dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-full px-4 py-2 transition-colors hover:bg-white/10"
                  style={{
                    color: CREAM,
                    border: "1px solid rgba(244,241,234,0.35)",
                  }}
                >
                  Log in
                </Link>
                <Link
                  to="/signup"
                  className="rounded-full px-5 py-2.5 font-medium transition-opacity hover:opacity-90"
                  style={{ backgroundColor: CREAM, color: INK }}
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </header>

        {/* HERO CONTENT */}
        <div className="relative z-10 mx-auto max-w-6xl px-6 pt-10 pb-16 md:px-10 md:pt-16 md:pb-24">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_300px]">
            <div className="text-center lg:text-left lg:pr-6">
              <h1
                className="m-0 landing-fadeup"
                style={{
                  color: CREAM,
                  fontSize: "clamp(42px, 7vw, 76px)",
                  lineHeight: 1.04,
                  letterSpacing: "-1.5px",
                  fontWeight: 700,
                }}
              >
                Where{" "}
                <span
                  className="font-editorial italic"
                  style={{ color: GOLD, fontWeight: 500 }}
                >
                  unforgettable
                </span>
                <br />
                events begin
                <span style={{ color: GOLD }}>.</span>
                <span
                  className="align-super text-[0.35em] ml-1"
                  style={{ color: GOLD }}
                >
                  ✦
                </span>
              </h1>
              <p
                className="mx-auto lg:mx-0 mt-5 max-w-lg text-[15px] md:text-base leading-relaxed landing-fadeup"
                style={{ color: "rgba(244,241,234,0.75)", animationDelay: "120ms" }}
              >
                The all-in-one marketplace and planning experience for hosts and
                the vendors who bring visions to life.
              </p>

              {/* Two paths */}
              <div
                className="mt-8 grid gap-3 sm:grid-cols-2 landing-fadeup"
                style={{ animationDelay: "220ms" }}
              >
                <Link
                  to="/vendors"
                  className="group flex items-center gap-4 rounded-2xl p-4 text-left transition-colors"
                  style={{
                    backgroundColor: "rgba(244,241,234,0.94)",
                    border: "1px solid rgba(244,241,234,0.4)",
                  }}
                >
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: "rgba(201,168,106,0.18)" }}
                  >
                    <Users className="h-5 w-5" style={{ color: BRONZE }} />
                  </span>
                  <span className="flex-1">
                    <span className="block text-[14.5px] font-semibold" style={{ color: INK }}>
                      I'm planning an event
                    </span>
                    <span className="block text-[12.5px] mt-0.5" style={{ color: "rgba(20,22,26,0.6)" }}>
                      Find and book trusted vendors for any occasion
                    </span>
                  </span>
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    style={{ color: BRONZE }}
                  />
                </Link>
                <Link
                  to="/signup/vendor"
                  className="group flex items-center gap-4 rounded-2xl p-4 text-left transition-colors hover:bg-white/10"
                  style={{
                    backgroundColor: "rgba(20,22,26,0.55)",
                    border: "1px solid rgba(244,241,234,0.22)",
                    backdropFilter: "blur(10px)",
                  }}
                >
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: "rgba(201,168,106,0.22)" }}
                  >
                    <Store className="h-5 w-5" style={{ color: GOLD }} />
                  </span>
                  <span className="flex-1">
                    <span className="block text-[14.5px] font-semibold" style={{ color: CREAM }}>
                      I'm a vendor
                    </span>
                    <span className="block text-[12.5px] mt-0.5" style={{ color: "rgba(244,241,234,0.65)" }}>
                      Get discovered, connect with clients, grow your business
                    </span>
                  </span>
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    style={{ color: GOLD }}
                  />
                </Link>
              </div>

              {/* Search */}
              <form
                onSubmit={submitSearch}
                className="mt-4 flex flex-col gap-2 rounded-2xl p-2 sm:flex-row sm:items-center sm:rounded-full landing-fadeup"
                style={{
                  backgroundColor: "rgba(244,241,234,0.96)",
                  animationDelay: "320ms",
                }}
              >
                <div className="flex flex-1 items-center gap-2.5 px-3 py-2">
                  <Search className="h-4 w-4 shrink-0" style={{ color: BRONZE }} />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="What are you planning?"
                    className="w-full bg-transparent text-[14px] outline-none placeholder:text-black/40"
                    style={{ color: INK }}
                  />
                </div>
                <div
                  className="flex flex-1 items-center gap-2.5 px-3 py-2 sm:border-l"
                  style={{ borderColor: "rgba(20,22,26,0.12)" }}
                >
                  <MapPin className="h-4 w-4 shrink-0" style={{ color: BRONZE }} />
                  <input
                    value={loc}
                    onChange={(e) => setLoc(e.target.value)}
                    placeholder="Location"
                    className="w-full bg-transparent text-[14px] outline-none placeholder:text-black/40"
                    style={{ color: INK }}
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-full px-7 py-3 text-[14px] font-semibold transition-opacity hover:opacity-90"
                  style={{ backgroundColor: INK, color: CREAM }}
                >
                  Search
                </button>
              </form>

              {/* Popular searches */}
              <div
                className="mt-4 flex flex-wrap items-center justify-center gap-2 lg:justify-start landing-fadeup"
                style={{ animationDelay: "420ms" }}
              >
                <span className="text-[11.5px]" style={{ color: "rgba(244,241,234,0.55)" }}>
                  Popular searches:
                </span>
                {POPULAR_SEARCHES.map((s) => (
                  <Link
                    key={s.label}
                    to={s.to}
                    className="rounded-full px-3 py-1 text-[11.5px] transition-colors hover:bg-white/15"
                    style={{
                      color: "rgba(244,241,234,0.85)",
                      border: "1px solid rgba(244,241,234,0.28)",
                    }}
                  >
                    {s.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Floating REAL vendor card (desktop only) */}
            {featured ? (
              <Link
                to={featured.slug ? `/vendors/${featured.slug}` : "/vendors"}
                className="hidden lg:block landing-float"
                aria-label={`View ${featured.name}`}
              >
                <div
                  className="overflow-hidden rounded-3xl"
                  style={{
                    backgroundColor: "rgba(244,241,234,0.97)",
                    boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6)",
                  }}
                >
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <Picture
                      source={heroDinner}
                      alt=""
                      sizes="300px"
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/85">
                      <Heart className="h-4 w-4" style={{ color: INK }} />
                    </span>
                  </div>
                  <div className="p-4">
                    {featured.studioVerified ? (
                      <span className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: BRONZE }}>
                        <StudioVerifiedBadge /> Verified vendor
                      </span>
                    ) : (
                      <span className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: BRONZE }}>
                        ✦ Featured vendor
                      </span>
                    )}
                    <p className="m-0 font-editorial not-italic text-[19px]" style={{ color: INK }}>
                      {featured.name}
                    </p>
                    <p className="m-0 mt-0.5 text-[12px]" style={{ color: "rgba(20,22,26,0.55)" }}>
                      {featured.category}
                    </p>
                    <p className="m-0 mt-1.5 flex items-center gap-1 text-[12px]" style={{ color: "rgba(20,22,26,0.7)" }}>
                      {featured.reviews > 0 ? (
                        <>
                          <Star className="h-3.5 w-3.5 fill-current" style={{ color: GOLD }} />
                          {featured.rating.toFixed(1)} ({featured.reviews})
                        </>
                      ) : (
                        <span>{featured.location ?? "On Vendora"}</span>
                      )}
                    </p>
                  </div>
                </div>
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {/* ═══════════════ FOR HOSTS — ivory journey ═══════════════ */}
      <section id="how-it-works" className="px-6 py-20 md:px-10 md:py-28">
        <div className="mx-auto max-w-6xl">
          <p className="font-label text-center" style={{ color: BRONZE }}>
            For hosts
          </p>
          <h2
            className="mx-auto mt-3 mb-12 max-w-2xl text-center text-[30px] md:text-[42px]"
            style={{ color: INK, lineHeight: 1.1 }}
          >
            Plan with confidence.{" "}
            <span className="font-editorial italic" style={{ color: BRONZE, fontWeight: 500 }}>
              Enjoy
            </span>{" "}
            every moment.
          </h2>

          <div className="grid gap-8 lg:grid-cols-[1fr_250px] lg:gap-12">
            <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-4">
              {HOST_STEPS.map((s) => (
                <div key={s.n} className="text-center">
                  {/* Arch-top photo, per the mock */}
                  <div
                    className="mx-auto aspect-[3/4] w-full max-w-[190px] overflow-hidden"
                    style={{
                      borderRadius: "999px 999px 22px 22px",
                      border: "1px solid rgba(201,168,106,0.4)",
                      padding: "6px",
                      backgroundColor: "rgba(251,249,244,0.9)",
                    }}
                  >
                    <div
                      className="h-full w-full overflow-hidden"
                      style={{ borderRadius: "999px 999px 18px 18px" }}
                    >
                      <Picture
                        source={s.image}
                        alt={s.title}
                        loading="lazy"
                        sizes="190px"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </div>
                  <p className="m-0 mt-4 text-[15.5px] font-semibold" style={{ color: INK }}>
                    {s.n}. {s.title}
                  </p>
                  <p className="m-0 mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "rgba(20,22,26,0.55)" }}>
                    {s.body}
                  </p>
                </div>
              ))}
            </div>

            {/* Every event, every type */}
            <div
              className="self-start rounded-3xl p-6"
              style={{
                backgroundColor: "#fbf9f4",
                border: "1px solid #e6e1d5",
              }}
            >
              <p className="m-0 font-editorial not-italic text-[22px] leading-snug" style={{ color: INK }}>
                Every event.
                <br />
                Every type. <span style={{ color: GOLD }}>✦</span>
              </p>
              <ul className="m-0 mt-4 list-none space-y-2.5 p-0">
                {EVENT_TYPES.map((t) => (
                  <li
                    key={t}
                    className="border-b pb-2.5 text-[13px] last:border-0 last:pb-0"
                    style={{ color: "rgba(20,22,26,0.7)", borderColor: "#ece7db" }}
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ FOR VENDORS — charcoal journey ═══════════════ */}
      <section className="px-6 py-20 md:px-10 md:py-28" style={{ backgroundColor: INK }}>
        <div className="mx-auto max-w-6xl">
          <p className="font-label text-center" style={{ color: GOLD }}>
            For vendors
          </p>
          <h2
            className="mx-auto mt-3 mb-12 max-w-2xl text-center text-[30px] md:text-[42px]"
            style={{ color: CREAM, lineHeight: 1.1 }}
          >
            More clients. More bookings. More{" "}
            <span className="font-editorial italic" style={{ color: GOLD, fontWeight: 500 }}>
              growth
            </span>
            .
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {VENDOR_STEPS.map((s) => (
              <div
                key={s.n}
                className="rounded-3xl p-6"
                style={{
                  backgroundColor: "rgba(244,241,234,0.05)",
                  border: "1px solid rgba(201,168,106,0.25)",
                }}
              >
                <p
                  className="m-0 font-editorial not-italic text-[30px]"
                  style={{ color: GOLD }}
                >
                  {s.n}
                </p>
                <p className="m-0 mt-3 text-[15.5px] font-semibold" style={{ color: CREAM }}>
                  {s.title}
                </p>
                <p
                  className="m-0 mt-1.5 text-[12.5px] leading-relaxed"
                  style={{ color: "rgba(244,241,234,0.6)" }}
                >
                  {s.body}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link
              to="/signup/vendor"
              className="inline-flex items-center gap-2 rounded-full px-7 py-3 text-[14px] font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: GOLD, color: INK }}
            >
              List your business — free <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════ THE CONNECTION — emotional band ═══════════════ */}
      <section className="grid md:grid-cols-3" style={{ backgroundColor: "#fbf9f4" }}>
        <div className="relative hidden aspect-[4/3] md:block md:aspect-auto">
          <Picture
            source={heroDinner}
            alt=""
            loading="lazy"
            sizes="(min-width: 768px) 33vw, 100vw"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
        <div className="flex flex-col items-center justify-center px-8 py-16 text-center md:py-20">
          <h2 className="m-0 text-[26px] md:text-[30px]" style={{ color: INK, lineHeight: 1.2 }}>
            Hosts dream it.
            <br />
            Vendors bring it to life.
          </h2>
          <p className="m-0 mt-4 max-w-xs text-[13.5px] leading-relaxed" style={{ color: "rgba(20,22,26,0.55)" }}>
            Vendora connects the right people so every detail comes together
            beautifully.
          </p>
          <span className="mt-5 text-[17px]" style={{ color: GOLD }}>
            ✦
          </span>
        </div>
        <div className="relative hidden aspect-[4/3] md:block md:aspect-auto">
          <Picture
            source={heroNye}
            alt=""
            loading="lazy"
            sizes="(min-width: 768px) 33vw, 100vw"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      </section>

      {/* ═══════════════ TOOLS — everything you need ═══════════════ */}
      <section className="px-6 py-20 md:px-10 md:py-28">
        <div className="mx-auto max-w-6xl">
          <p className="font-label text-center" style={{ color: BRONZE }}>
            Everything you need, all in one place
          </p>
          <h2
            className="mx-auto mt-3 mb-12 max-w-2xl text-center text-[30px] md:text-[38px]"
            style={{ color: INK, lineHeight: 1.15 }}
          >
            Powerful tools.{" "}
            <span className="font-editorial italic" style={{ fontWeight: 500 }}>
              Seamless
            </span>{" "}
            experience.
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 lg:grid-cols-6">
            {TOOLS.map((t) => (
              <div key={t.title} className="text-center">
                <span
                  className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{
                    backgroundColor: "rgba(201,168,106,0.14)",
                    border: "1px solid rgba(201,168,106,0.35)",
                  }}
                >
                  <t.icon className="h-5 w-5" style={{ color: BRONZE }} />
                </span>
                <p className="m-0 mt-3 text-[13.5px] font-semibold" style={{ color: INK }}>
                  {t.title}
                </p>
                <p className="m-0 mt-1 text-[11.5px] leading-relaxed" style={{ color: "rgba(20,22,26,0.5)" }}>
                  {t.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ CLOSING CTA — dark ═══════════════ */}
      <section className="px-6 py-20 md:px-10 md:py-24" style={{ backgroundColor: INK }}>
        <div className="mx-auto max-w-4xl text-center">
          <p className="font-label" style={{ color: GOLD }}>
            Ready to make magic?
          </p>
          <h2
            className="mx-auto mt-3 max-w-xl text-[30px] md:text-[40px]"
            style={{ color: CREAM, lineHeight: 1.12 }}
          >
            Join the hosts and vendors creating{" "}
            <span className="font-editorial italic" style={{ color: GOLD, fontWeight: 500 }}>
              unforgettable
            </span>{" "}
            events.
          </h2>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/vendors"
              className="rounded-full px-7 py-3 text-[14px] font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: GOLD, color: INK }}
            >
              Plan your event
            </Link>
            <Link
              to="/signup/vendor"
              className="rounded-full px-7 py-3 text-[14px] font-semibold transition-colors hover:bg-white/10"
              style={{ color: CREAM, border: "1px solid rgba(244,241,234,0.35)" }}
            >
              List your business
            </Link>
          </div>
          <p className="mx-auto mt-8 text-[12.5px]" style={{ color: "rgba(244,241,234,0.5)" }}>
            <span style={{ color: GOLD }}>✦</span> Curated, verified vendors
            <span className="mx-2.5" style={{ color: "rgba(244,241,234,0.25)" }}>·</span>
            Secure payments
            <span className="mx-2.5" style={{ color: "rgba(244,241,234,0.25)" }}>·</span>
            Support from real people
          </p>
        </div>
      </section>

      {/* ═══════════════ FOOTER — premium dark ═══════════════ */}
      <footer
        className="px-6 pt-16 pb-8 md:px-10"
        style={{ backgroundColor: "#101216", borderTop: "1px solid rgba(201,168,106,0.2)" }}
      >
        <div className="mx-auto mb-12 grid max-w-6xl grid-cols-1 gap-10 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <VendoraLogo size="md" color={CREAM} withTagline />
            <div className="mt-2.5 text-[13px] leading-relaxed" style={{ color: "rgba(244,241,234,0.55)" }}>
              Every detail, perfectly composed.
            </div>
          </div>

          {[
            {
              title: "For hosts",
              links: [
                { label: "Browse vendors", to: "/vendors" },
                { label: "By location", to: "/vendors/locations" },
                { label: "Explore", to: "/explore" },
              ],
            },
            {
              title: "For vendors",
              links: [
                { label: "List your business", to: "/signup/vendor" },
                { label: "Website builder", to: "/website-builder" },
                { label: "Changelog", to: "/changelog" },
              ],
            },
            {
              title: "Company",
              links: [
                { label: "Press", to: "/press" },
                { label: "Status", to: "/status" },
                { label: "Privacy", to: "/privacy" },
                { label: "Terms", to: "/terms" },
              ],
            },
          ].map((col) => (
            <div key={col.title}>
              <div
                className="mb-4 text-[10px] font-medium uppercase"
                style={{ color: GOLD, letterSpacing: "2px" }}
              >
                {col.title}
              </div>
              <ul className="m-0 list-none space-y-2.5 p-0 text-[13px]">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      to={l.to}
                      className="transition-colors hover:text-white"
                      style={{ color: "rgba(244,241,234,0.7)" }}
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
                {col.title === "Company" ? (
                  <li>
                    <a
                      href="mailto:hello@eventvendora.com"
                      className="transition-colors hover:text-white"
                      style={{ color: "rgba(244,241,234,0.7)" }}
                    >
                      hello@eventvendora.com
                    </a>
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
        </div>

        <div
          className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 pt-6"
          style={{ borderTop: "1px solid rgba(244,241,234,0.12)" }}
        >
          <div className="text-[11px]" style={{ color: "rgba(244,241,234,0.45)" }}>
            © 2026 Vendora. All rights reserved.
          </div>
          <div className="flex gap-5 text-[12px]">
            {[
              { label: "Instagram", href: "https://instagram.com/eventvendora" },
              { label: "TikTok", href: "https://tiktok.com/@eventvendora" },
              { label: "Facebook", href: "https://facebook.com/eventvendora" },
            ].map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noreferrer noopener"
                className="transition-colors hover:text-white"
                style={{ color: "rgba(244,241,234,0.6)" }}
              >
                {s.label}
              </a>
            ))}
          </div>
        </div>
      </footer>

      {/* Page-local motion. Respect reduced-motion. */}
      <style>{`
        .landing-kenburns {
          animation: landingKenburns 36s ease-in-out infinite alternate;
          transform-origin: 60% 40%;
        }
        @keyframes landingKenburns {
          from { transform: scale(1); }
          to { transform: scale(1.08); }
        }
        .landing-fadeup {
          opacity: 0;
          animation: landingFadeUp 800ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @keyframes landingFadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .landing-float {
          animation: landingFloat 7s ease-in-out infinite;
        }
        @keyframes landingFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .landing-kenburns, .landing-float { animation: none !important; }
          .landing-fadeup { animation: none !important; opacity: 1; }
        }
      `}</style>
    </div>
  );
}
