// For hosts: what Vendora does for someone planning an event. This used
// to sit on the home page; it has its own page so the home page stays
// simple. "I'm planning an event" on the home page leads here.

import { CalendarDays, CreditCard, FileText, MessageCircle, Search, Star } from "lucide-react";
import { Footer } from "@/components/public/Footer";
import { ClosingBand, PhotoHero } from "@/components/public/PhotoHero";
import { Picture } from "@/components/shared/Picture";
import dinner from "@/assets/vendora-hero-dinner.jpg?as=picture";
import venues from "@/assets/vendor-venue.jpg?as=picture";
import media from "@/assets/vendor-photographer.jpg?as=picture";
import designDecor from "@/assets/vendor-florist.jpg?as=picture";
import weddingImg from "@/assets/hero/wedding.jpg?as=picture";

const STEPS = [
  { title: "Discover", body: "Find the perfect vendors for your unique vision.", image: venues },
  { title: "Connect", body: "Message, compare, and get custom quotes.", image: media },
  { title: "Plan", body: "Keep each event's date, guests and notes in one place.", image: designDecor },
  { title: "Book", body: "Secure your vendors and relax, knowing you're in good hands.", image: weddingImg },
];

const EVENT_TYPES = [
  "Weddings",
  "Birthdays",
  "Corporate events",
  "Parties & celebrations",
  "Social gatherings",
  "and more…",
];

const TOOLS = [
  { icon: Search, title: "Smart search", body: "Find the right vendors faster." },
  { icon: MessageCircle, title: "Messaging", body: "All your conversations in one place." },
  { icon: CalendarDays, title: "Availability", body: "Pick your date to see who's free." },
  { icon: FileText, title: "Quotes & proposals", body: "Compare and decide with confidence." },
  { icon: CreditCard, title: "Contracts & payments", body: "Sign and pay securely online." },
  { icon: Star, title: "Reviews", body: "Real feedback from real clients." },
];

export default function ForHostsPage() {
  return (
    <div className="min-h-screen text-[#f4f1ea]" style={{ backgroundColor: "#14161a" }}>
      <PhotoHero
        photo={dinner}
        eyebrow="For hosts"
        title={
          <>
            Plan with confidence. <span className="font-editorial text-gold">Enjoy</span> every moment.
          </>
        }
        sub="Find trusted vendors, compare quotes and keep every detail of your event in one place."
        primary={{ label: "Find vendors", to: "/vendors" }}
        secondary={{ label: "How it works", to: "/how-it-works#for-hosts" }}
      />

      <main id="main-content">
        {/* Steps */}
        <section className="container mx-auto px-5 py-16 md:px-8 md:py-24">
          <p className="m-0 text-center font-label text-gold">How it works</p>
          <h2 className="m-0 mx-auto mt-3 max-w-2xl text-center text-[30px] leading-tight md:text-[42px]">
            Four steps to your event.
          </h2>

          <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_260px] lg:gap-12">
            <ol className="m-0 grid list-none grid-cols-2 gap-x-5 gap-y-10 p-0 md:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="text-center">
                  {/* Arch-top photo */}
                  <div
                    className="mx-auto aspect-[3/4] w-full max-w-[190px] overflow-hidden bg-white/[0.03]"
                    style={{
                      borderRadius: "999px 999px 22px 22px",
                      border: "1px solid rgba(201,168,106,0.4)",
                      padding: "6px",
                    }}
                  >
                    <div className="h-full w-full overflow-hidden" style={{ borderRadius: "999px 999px 18px 18px" }}>
                      <Picture source={s.image} alt="" sizes="190px" className="h-full w-full object-cover" />
                    </div>
                  </div>
                  <p className="m-0 mt-4 text-[16px] font-bold">
                    {i + 1}. {s.title}
                  </p>
                  <p className="m-0 mx-auto mt-1.5 max-w-[220px] text-[13.5px] leading-relaxed">{s.body}</p>
                </li>
              ))}
            </ol>

            <div className="self-start rounded-2xl border border-white/15 bg-white/[0.03] p-6">
              <p className="m-0 text-[22px] font-bold leading-snug">
                Every event.
                <br />
                Every type. <span className="text-gold">✦</span>
              </p>
              <ul className="m-0 mt-4 list-none space-y-2.5 p-0">
                {EVENT_TYPES.map((t) => (
                  <li key={t} className="border-b border-white/15 pb-2.5 text-[14px] last:border-0 last:pb-0">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Tools */}
        <section className="border-t border-white/15">
          <div className="container mx-auto px-5 py-16 md:px-8 md:py-24">
            <p className="m-0 text-center font-label text-gold">Everything you need, all in one place</p>
            <h2 className="m-0 mx-auto mt-3 max-w-2xl text-center text-[30px] leading-tight md:text-[38px]">
              Powerful tools. Seamless experience.
            </h2>
            <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 lg:grid-cols-6">
              {TOOLS.map((t) => (
                <div key={t.title} className="text-center">
                  <span
                    className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gold/15"
                    style={{ border: "1px solid rgba(201,168,106,0.4)" }}
                  >
                    <t.icon className="h-5 w-5 text-gold" aria-hidden />
                  </span>
                  <p className="m-0 mt-3 text-[14px] font-bold">{t.title}</p>
                  <p className="m-0 mt-1 text-[13px] leading-relaxed">{t.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="border-t border-white/15">
          <ClosingBand
            title={
              <>
                Let's make something <span className="font-editorial text-gold">unforgettable.</span>
              </>
            }
            cta={{ label: "Find vendors", to: "/vendors" }}
          />
        </div>
      </main>

      <Footer tone="dark" />
    </div>
  );
}
