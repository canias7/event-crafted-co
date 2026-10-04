// For vendors: what Vendora does for event businesses. This used to sit
// on the home page; it has its own page so the home page stays simple.
// "I'm a vendor" on the home page leads here.

import { CalendarDays, CreditCard, FileText, MessageCircle, Search, Star } from "lucide-react";
import { Footer } from "@/components/public/Footer";
import { ClosingBand, PhotoHero } from "@/components/public/PhotoHero";
import planner from "@/assets/hero/wedding.jpg?as=picture";

const STEPS = [
  { title: "Get discovered", body: "Be seen by people actively planning events like yours." },
  { title: "Manage inquiries", body: "Respond, chat, and share proposals all in one inbox." },
  { title: "Book clients", body: "Secure bookings with contracts, payments, and automations." },
  { title: "Grow your business", body: "Track performance, collect reviews, and build your brand." },
];

const TOOLS = [
  { icon: Search, title: "Get found", body: "Show up in search, on Explore and on category pages." },
  { icon: MessageCircle, title: "One inbox", body: "Every client conversation in one place." },
  { icon: CalendarDays, title: "Availability", body: "Block busy dates, so hosts searching them see who's free." },
  { icon: FileText, title: "Proposals & contracts", body: "Send proposals and contracts clients sign online." },
  { icon: CreditCard, title: "Payments", body: "Get paid securely online." },
  { icon: Star, title: "Reviews", body: "Build trust with reviews from real clients." },
];

export default function ForVendorsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PhotoHero
        photo={planner}
        eyebrow="For vendors"
        title={
          <>
            More clients. More bookings. More <span className="font-editorial text-gold">growth.</span>
          </>
        }
        sub="Get discovered by people planning events like yours, then run inquiries, proposals and payments in one place."
        primary={{ label: "List your business — free", to: "/signup/vendor" }}
        secondary={{ label: "How it works", to: "/how-it-works#for-vendors" }}
      />

      <main id="main-content">
        {/* Steps */}
        <section className="container mx-auto px-5 py-16 md:px-8 md:py-24">
          <p className="m-0 text-center font-label text-accent">How it works</p>
          <h2 className="m-0 mx-auto mt-3 max-w-2xl text-center text-[30px] leading-tight md:text-[42px]">
            From first inquiry to booked.
          </h2>
          <ol className="m-0 mt-12 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-border bg-card p-4 md:p-6">
                <p className="m-0 text-[30px] font-bold leading-none text-accent">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <p className="m-0 mt-4 text-[16px] font-bold">{s.title}</p>
                <p className="m-0 mt-1.5 text-[13.5px] leading-relaxed">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Tools */}
        <section className="border-t border-border">
          <div className="container mx-auto px-5 py-16 md:px-8 md:py-24">
            <p className="m-0 text-center font-label text-accent">Everything you need, all in one place</p>
            <h2 className="m-0 mx-auto mt-3 max-w-2xl text-center text-[30px] leading-tight md:text-[38px]">
              Run your business from one place.
            </h2>
            <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 lg:grid-cols-6">
              {TOOLS.map((t) => (
                <div key={t.title} className="text-center">
                  <span
                    className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-pending"
                    style={{ border: "1px solid rgba(201,168,106,0.4)" }}
                  >
                    <t.icon className="h-5 w-5 text-accent" aria-hidden />
                  </span>
                  <p className="m-0 mt-3 text-[14px] font-bold">{t.title}</p>
                  <p className="m-0 mt-1 text-[13px] leading-relaxed">{t.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <ClosingBand
          title={
            <>
              Start <span className="font-editorial text-gold">free.</span>
            </>
          }
          sub="The Free plan includes one listing. Upgrade whenever you're ready for more."
          cta={{ label: "List your business — free", to: "/signup/vendor" }}
        />
      </main>

      <Footer tone="dark" />
    </div>
  );
}
