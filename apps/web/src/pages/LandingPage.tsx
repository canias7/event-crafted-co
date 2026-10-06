import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, MapPin, Search, Store, Users } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { Footer } from "@/components/public/Footer";
import { PublicNav } from "@/components/public/PublicNav";
import { HomeExperimentSection } from "@/components/home/HomeExperimentSection";
import { Picture } from "@/components/shared/Picture";
// vite-imagetools `?as=picture` (see vite.config.ts) → AVIF + WebP + JPG
// at 640/1024/1600, same pattern VendorCard uses for the browse grid.
import heroCinematic from "@/assets/vendora-hero-cinematic.jpg?as=picture";

// ── Palette (matches the mobile apps) ──────────────────────────────
const INK = "#14161a";
const CREAM = "#f4f1ea";
const GOLD = "#c9a86a";
const BRONZE = "#8a6f3e";

// Home page, kept simple on purpose: the cinematic hero (headline, the
// two paths, search) and the footer. What Vendora does for each side
// lives on its own page: "I'm planning an event" leads to /for-hosts and
// "I'm a vendor" to /for-vendors. Explore and How it works have their own
// pages too.
export default function LandingPage() {
  const navigate = useNavigate();
  const { t } = useTranslation("landing");

  // How it works used to be a section here; old /#how-it-works links go
  // to its page.
  useEffect(() => {
    if (window.location.hash === "#how-it-works") {
      navigate("/how-it-works", { replace: true });
    }
  }, [navigate]);
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState("");

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (loc.trim()) params.set("location", loc.trim());
    navigate(`/vendors${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <div className="min-h-screen text-foreground" style={{ backgroundColor: INK }}>
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

        {/* NAV (overlaid): the same header as every other public page. */}
        <PublicNav tone="overlay" />

        {/* HERO CONTENT */}
        <div className="relative z-10 mx-auto max-w-6xl px-5 pt-10 pb-16 md:px-8 md:pt-16 md:pb-24">
          <div className="mx-auto max-w-3xl text-center">
            <h1
              className="m-0 landing-fadeup hero-headline"
              style={{
                color: CREAM,
                fontSize: "clamp(42px, 7vw, 76px)",
                lineHeight: 1.04,
                letterSpacing: "-1.5px",
                fontWeight: 700,
              }}
            >
              <Trans
                t={t}
                i18nKey="hero.title"
                components={{
                  gold: <span className="font-editorial" style={{ color: GOLD }} />,
                  br: <br />,
                }}
              />
            </h1>
            <p
              className="mx-auto mt-5 max-w-lg text-[15px] md:text-base leading-relaxed landing-fadeup hero-intro"
              style={{ color: "rgba(244,241,234,0.75)", animationDelay: "120ms" }}
            >
              {t("hero.intro")}
            </p>

            {/* Two paths */}
            <div
              className="mt-8 grid gap-3 sm:grid-cols-2 landing-fadeup"
              style={{ animationDelay: "220ms" }}
            >
              <Link
                to="/for-hosts"
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
                    {t("paths.host.title")}
                  </span>
                  <span className="block text-[12.5px] mt-0.5" style={{ color: "rgba(20,22,26,0.6)" }}>
                    {t("paths.host.body")}
                  </span>
                </span>
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  style={{ color: BRONZE }}
                />
              </Link>
              <Link
                to="/for-vendors"
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
                    {t("paths.vendor.title")}
                  </span>
                  <span className="block text-[12.5px] mt-0.5" style={{ color: "rgba(244,241,234,0.65)" }}>
                    {t("paths.vendor.body")}
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
                  placeholder={t("search.what_placeholder")}
                  className="w-full bg-transparent text-[14px] outline-none placeholder:text-placeholder"
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
                  placeholder={t("search.location_placeholder")}
                  className="w-full bg-transparent text-[14px] outline-none placeholder:text-placeholder"
                  style={{ color: INK }}
                />
              </div>
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center whitespace-nowrap rounded-full bg-gold px-7 text-[14px] font-bold text-foreground transition-colors hover:bg-gold-hover"
              >
                {t("search.submit")}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Homepage A/B/C test: one of three sections for each visitor. */}
      <HomeExperimentSection />

      <Footer tone="dark" />

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
        @media (prefers-reduced-motion: reduce) {
          .landing-kenburns { animation: none !important; }
          .landing-fadeup { animation: none !important; opacity: 1; }
        }
      `}</style>
    </div>
  );
}
