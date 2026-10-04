// How it works — a step-by-step walk through Vendora for hosts and for
// vendors. Dark page (ink, cream text, champagne gold) per the owner's
// mockup. Every step describes something the product does today.

import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { Picture, type PictureSource } from "@/components/shared/Picture";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import heroCinematic from "@/assets/vendora-hero-cinematic.jpg?as=picture";
import florist from "@/assets/vendor-florist.jpg?as=picture";
import photographer from "@/assets/vendor-photographer.jpg?as=picture";
import dinner from "@/assets/vendora-hero-dinner.jpg?as=picture";
import makeup from "@/assets/vendor-makeup.jpg?as=picture";
import wedding from "@/assets/hero/wedding.jpg?as=picture";

const INK = "#14161a";
const CREAM = "#f4f1ea";
const GOLD = "#c9a86a";
const SOFT = "rgba(244,241,234,0.78)";

type Step = {
  title: string;
  body: string;
  points: string[];
  image?: PictureSource;
};

const HOST_STEPS: Step[] = [
  {
    title: "Find your inspiration",
    body: "Start with ideas. Scroll the Explore feed to see real work from vendors on Vendora.",
    points: [
      "Browse vendors' portfolio photos",
      "Filter by category, from photography to catering",
      "Save the vendors you love with the heart",
    ],
    image: florist,
  },
  {
    title: "Meet your vendors",
    body: "Narrow it down. Search by what you need, where your event is and your date.",
    points: [
      "Search by service and location",
      "Pick your date to hide vendors who are booked",
      "Compare portfolios, prices and packages",
    ],
    image: photographer,
  },
  {
    title: "Start the conversation",
    body: "Open a vendor's profile and send an inquiry with your date and a few details.",
    points: [
      "Tell them about your event in one message",
      "Replies land in your inbox",
      "Ask questions and get a custom quote",
    ],
    image: dinner,
  },
  {
    title: "Plan in one place",
    body: "Keep track of each event you're planning, next to your conversations with vendors.",
    points: [
      "Add each event with its date and guest count",
      "Keep the location and your notes together",
      "Every inquiry and reply in one inbox",
    ],
  },
  {
    title: "Book with confidence",
    body: "When you're ready, your vendor sends a proposal. Review it, sign and pay securely online.",
    points: [
      "Proposals and contracts you can sign online",
      "Secure online payments",
      "Leave a review after your event",
    ],
  },
];

const VENDOR_STEPS: Omit<Step, "image">[] = [
  {
    title: "Create your profile",
    body: "Sign up as a vendor and introduce your business: category, location, pricing and services. The Free plan includes one listing.",
    points: [],
  },
  {
    title: "Showcase your work",
    body: "Add portfolio photos so hosts can see what you do.",
    points: [],
  },
  {
    title: "Get approved and discovered",
    body: "Every listing is reviewed before it goes live. Then hosts find you in search, on Explore and on category pages.",
    points: [],
  },
  {
    title: "Answer inquiries",
    body: "Hosts message you with their date and details. Reply, chat and send proposals from one inbox.",
    points: [],
  },
  {
    title: "Book and get paid",
    body: "Turn conversations into bookings with contracts and online payments.",
    points: [],
  },
  {
    title: "Grow your business",
    body: "Collect reviews, track how your listing performs and keep building your brand.",
    points: [],
  },
];

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "How do I find the right vendor?",
    a: (
      <>
        Search <Link to="/vendors" className="text-gold underline-offset-4 hover:underline">Vendors</Link> by
        service, location and date, or scroll{" "}
        <Link to="/explore" className="text-gold underline-offset-4 hover:underline">Explore</Link> for ideas.
        Open any profile to see their work, pricing and packages, and save the
        ones you like.
      </>
    ),
  },
  {
    q: "How do I contact a vendor?",
    a: "Open the vendor's profile and tap Send Inquiry. Add your date and a few details about your event. Their reply comes to your inbox, where you can keep the conversation going.",
  },
  {
    q: "How are vendors checked?",
    a: "Every listing is reviewed by the Vendora team before it appears. Vendors who also verify their documents show a verified badge on their profile.",
  },
  {
    q: "How does booking and payment work?",
    a: "Your vendor sends you a proposal. You can review and sign it online, then pay securely through Vendora.",
  },
  {
    q: "Can I join as a vendor?",
    a: (
      <>
        Yes.{" "}
        <Link to="/signup/vendor" className="text-gold underline-offset-4 hover:underline">
          Sign up as a vendor
        </Link>
        , create your listing and add your work. The Free plan includes one
        listing, and your listing goes live once it's approved.
      </>
    ),
  },
  {
    q: "I have another question.",
    a: (
      <>
        Visit the{" "}
        <Link to="/help" className="text-gold underline-offset-4 hover:underline">
          Help centre
        </Link>{" "}
        or email{" "}
        <a href="mailto:hello@eventvendora.com" className="text-gold underline-offset-4 hover:underline">
          hello@eventvendora.com
        </a>
        . Real people read every message.
      </>
    ),
  },
];

const num = (i: number) => String(i + 1).padStart(2, "0");

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: INK, color: CREAM }}>
      <PublicNav tone="dark" />

      <main id="main-content">
        {/* ═══════ HERO ═══════ */}
        <section className="container mx-auto grid items-center gap-10 px-5 py-12 md:px-8 md:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
          <div>
            <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: GOLD }}>
              How Vendora works
            </p>
            <h1
              className="m-0 mt-4"
              style={{ fontSize: "clamp(36px, 4.4vw, 54px)", lineHeight: 1.08, letterSpacing: "-1px" }}
            >
              Your vision.
              <br />
              The right people.
              <br />
              An <span style={{ color: GOLD }}>unforgettable</span> event.
            </h1>
            <p className="m-0 mt-5 max-w-md text-[16px] leading-relaxed md:text-lg" style={{ color: SOFT }}>
              Discover vendors, explore their work and start a conversation.
              Then plan and book it all in one place.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                to="/vendors"
                className="inline-flex h-[52px] items-center gap-2 rounded-full bg-gold px-7 text-[15px] font-bold text-foreground transition-colors hover:bg-gold-hover"
              >
                Explore vendors <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#for-vendors"
                className="inline-flex items-center gap-1.5 text-[15px] font-bold transition-colors hover:text-gold"
                style={{ color: GOLD }}
              >
                I'm a vendor <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-white/15">
            <Picture
              source={heroCinematic}
              alt="A candlelit dinner table set with roses"
              sizes="(min-width: 1024px) 55vw, 100vw"
              loading="eager"
              fetchPriority="high"
              className="aspect-[16/10] h-full w-full object-cover"
            />
          </div>
        </section>

        {/* Jump links */}
        <div className="container mx-auto px-5 md:px-8">
          <div className="flex flex-wrap gap-2 border-t border-white/15 pt-8">
            <a
              href="#for-hosts"
              className="inline-flex h-11 items-center rounded-full border border-white/15 px-5 text-[14px] font-bold transition-colors hover:border-white/40"
            >
              I'm planning an event
            </a>
            <a
              href="#for-vendors"
              className="inline-flex h-11 items-center rounded-full border border-white/15 px-5 text-[14px] font-bold transition-colors hover:border-white/40"
            >
              I'm a vendor
            </a>
            <a
              href="#faq"
              className="inline-flex h-11 items-center rounded-full border border-white/15 px-5 text-[14px] font-bold transition-colors hover:border-white/40"
            >
              Questions
            </a>
          </div>
        </div>

        {/* ═══════ FOR HOSTS ═══════ */}
        <section id="for-hosts" className="container mx-auto scroll-mt-20 px-5 py-14 md:px-8 md:py-20">
          <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: GOLD }}>
            For hosts
          </p>
          <h2 className="m-0 mt-3 text-[30px] leading-tight md:text-[42px]">
            From inspiration to booking, step by step.
          </h2>
          <p className="m-0 mt-3 max-w-2xl text-[15px] leading-relaxed md:text-base" style={{ color: SOFT }}>
            Planning a wedding, a birthday or a company event? Here's how it
            works from the first idea to the day itself.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {HOST_STEPS.slice(0, 3).map((s, i) => (
              <StepCard key={s.title} step={s} index={i} />
            ))}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {HOST_STEPS.slice(3).map((s, i) => (
              <StepCard key={s.title} step={s} index={i + 3} />
            ))}
          </div>

          <div className="mt-8">
            <Link
              to="/vendors"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-gold px-5 text-[14px] font-bold text-foreground transition-colors hover:bg-gold-hover"
            >
              Start exploring vendors <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* ═══════ FOR VENDORS ═══════ */}
        <section id="for-vendors" className="scroll-mt-16 border-y border-white/15">
          <div className="container mx-auto grid gap-10 px-5 py-14 md:px-8 md:py-20 lg:grid-cols-2 lg:gap-14">
            <div className="overflow-hidden rounded-3xl border border-white/15 lg:sticky lg:top-24 lg:self-start">
              <Picture
                source={makeup}
                alt="A makeup artist at work"
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="aspect-[4/3] h-full w-full object-cover lg:aspect-[4/5]"
              />
            </div>
            <div>
              <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: GOLD }}>
                For vendors
              </p>
              <h2 className="m-0 mt-3 text-[30px] leading-tight md:text-[42px]">
                Turn your craft into bookings.
              </h2>
              <p className="m-0 mt-3 max-w-xl text-[15px] leading-relaxed md:text-base" style={{ color: SOFT }}>
                Photographers, planners, caterers, florists, venues and more.
                Here's how you go from sign-up to booked.
              </p>
              <ol className="m-0 mt-8 list-none space-y-6 p-0">
                {VENDOR_STEPS.map((s, i) => (
                  <li key={s.title} className="flex gap-4">
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-[15px] font-bold"
                      style={{ borderColor: GOLD, color: GOLD }}
                    >
                      {num(i)}
                    </span>
                    <div className="pt-1.5">
                      <h3 className="m-0 text-[18px] leading-snug">{s.title}</h3>
                      <p className="m-0 mt-1 text-[14.5px] leading-relaxed" style={{ color: SOFT }}>
                        {s.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <Link
                to="/signup/vendor"
                className="mt-9 inline-flex h-11 items-center gap-2 rounded-full bg-gold px-5 text-[14px] font-bold text-foreground transition-colors hover:bg-gold-hover"
              >
                Join as a vendor <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ═══════ FAQ ═══════ */}
        <section id="faq" className="container mx-auto scroll-mt-20 px-5 py-14 md:px-8 md:py-20">
          <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: GOLD }}>
            FAQ
          </p>
          <h2 className="m-0 mt-3 text-[30px] leading-tight md:text-[42px]">
            A few things you might be wondering.
          </h2>
          <Accordion type="single" collapsible className="mt-8 space-y-3">
            {FAQS.map((f) => (
              <AccordionItem
                key={f.q}
                value={f.q}
                className="rounded-xl border border-white/15 px-5 data-[state=open]:border-white/30"
              >
                <AccordionTrigger className="py-4 text-left text-[16px] font-bold hover:no-underline [&>svg]:text-gold">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-[15px] leading-relaxed" style={{ color: SOFT }}>
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* ═══════ CLOSING CTA ═══════ */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0">
            <Picture source={wedding} alt="" sizes="100vw" className="h-full w-full object-cover" />
          </div>
          <div className="absolute inset-0" style={{ background: "rgba(10,11,14,0.62)" }} />
          <div className="relative container mx-auto px-5 py-20 text-center md:px-8 md:py-28">
            <h2 className="hero-headline m-0 mx-auto max-w-2xl text-[32px] leading-tight md:text-[48px]">
              Let's make something <span style={{ color: GOLD }}>unforgettable.</span>
            </h2>
            <Link
              to="/vendors"
              className="mt-8 inline-flex h-[52px] items-center gap-2 rounded-full bg-gold px-7 text-[15px] font-bold text-foreground transition-colors hover:bg-gold-hover"
            >
              Explore vendors <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <Footer tone="dark" />
    </div>
  );
}

function StepCard({ step, index }: { step: Step; index: number }) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-white/15 bg-white/[0.03] p-2">
      {step.image && (
        <div className="overflow-hidden rounded-xl">
          <Picture
            source={step.image}
            alt=""
            sizes="(min-width: 768px) 33vw, 100vw"
            className="aspect-[3/2] w-full object-cover"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col px-4 pb-5 pt-5">
        <div className="flex items-center gap-4">
          <span className="text-[34px] font-bold leading-none" style={{ color: GOLD }}>
            {num(index)}
          </span>
          <span className="h-px flex-1 bg-white/15" aria-hidden />
        </div>
        <h3 className="m-0 mt-4 text-[21px] leading-snug">{step.title}</h3>
        <p className="m-0 mt-2 text-[14.5px] leading-relaxed" style={{ color: SOFT }}>
          {step.body}
        </p>
        <ul className="m-0 mt-4 list-none space-y-2 p-0">
          {step.points.map((p) => (
            <li key={p} className="flex gap-2.5 text-[14px] leading-snug">
              <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: GOLD }} aria-hidden />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
