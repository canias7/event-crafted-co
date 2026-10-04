// Press kit. Only facts that are true today: claims that weren't (stock
// photos captioned as screenshots, an "editorial team" checking
// references, calendar sync, real-event galleries, US-wide coverage…)
// came off in Oct 2026 and are tracked in the owner's "Press page — to
// work on later" doc until they're real.

import { Download, Mail, Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { PublicNav } from "@/components/public/PublicNav";
import { CONTACT_EMAIL, Footer } from "@/components/public/Footer";
import { VendoraLogo } from "@/components/shared/VendoraLogo";
import { Button } from "@/components/ui/button";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

const STATS: Array<{ value: string; label: string }> = [
  { value: "31", label: "Vendor categories" },
  { value: "2", label: "Languages" },
  { value: "$0", label: "To list a business" },
];

const QUICK_FACTS = [
  {
    label: "What it is",
    body: "An event marketplace where hosts find, message and book vendors, and keep each event's date, guests and notes in one place. Weddings, birthdays, corporate events, parties and more.",
  },
  {
    label: "Founded",
    body: "2026.",
  },
  {
    label: "How vendors are reviewed",
    body: "Every listing is reviewed by the Vendora team before it goes live.",
  },
  {
    label: "What vendors get",
    body: "A listing with portfolio photos, packages and prices; one inbox for inquiries; proposals and contracts clients sign online; and secure online payments. The Free plan includes one listing.",
  },
  {
    label: "Finding vendors",
    body: "Search by category, city and date, with a page for each city and category.",
  },
  {
    label: "Languages",
    body: "English and Spanish.",
  },
];

const PALETTE = [
  { name: "Ink", hex: "#14161A" },
  { name: "Ivory", hex: "#F4F1EA", light: true },
  { name: "Cream", hex: "#FBF9F4", light: true },
  { name: "Bronze", hex: "#8A6F3E" },
  { name: "Champagne", hex: "#C9A86A" },
];

export default function PressPage() {
  const [copied, setCopied] = useState(false);

  useDocumentMeta({
    title: "Press kit — Vendora",
    description: "Vendora's logo, colours, quick facts and press contact.",
  });

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopied(true);
      toast.success("Email copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  }

  const emailButton = (
    <Button type="button" onClick={copyEmail}>
      {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Mail className="mr-1.5 h-3.5 w-3.5" />}
      {CONTACT_EMAIL}
      <Copy className="ml-1.5 h-3 w-3" />
    </Button>
  );

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      {/* Hero */}
      <section className="border-b border-border pb-12 pt-32 md:pb-16">
        <div className="container mx-auto max-w-5xl px-5 md:px-8">
          <p className="mb-4 font-label text-accent">Press kit</p>
          <h1 className="mb-5 font-editorial text-5xl leading-[1.0] md:text-6xl">
            Everything you need to <span className="text-accent">write about us.</span>
          </h1>
          <p className="mb-8 max-w-2xl text-base leading-relaxed text-foreground md:text-lg">
            Our logo and colours, the short version of what we do, and a real
            person you can email.
          </p>
          {emailButton}
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-border py-12">
        <div className="container mx-auto max-w-5xl px-5 md:px-8">
          <div className="grid grid-cols-3 gap-4">
            {STATS.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...spring, delay: i * 0.08 }}
                className="text-center md:text-left"
              >
                <p className="mb-1 font-editorial text-4xl tnum md:text-5xl">{s.value}</p>
                <p className="text-xs uppercase tracking-[0.2em] text-foreground">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Quick facts */}
      <section className="py-14 md:py-20">
        <div className="container mx-auto max-w-3xl px-5 md:px-8">
          <p className="mb-3 font-label text-accent">Quick facts</p>
          <h2 className="mb-10 font-editorial text-4xl">The 60-second version</h2>
          <dl className="space-y-6">
            {QUICK_FACTS.map((f) => (
              <div key={f.label}>
                <dt className="mb-1.5 text-xs uppercase tracking-[0.3em] text-accent">{f.label}</dt>
                <dd className="m-0 text-base leading-relaxed text-foreground">{f.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Logo + brand */}
      <section className="border-t border-border py-14 md:py-20">
        <div className="container mx-auto max-w-3xl px-5 md:px-8">
          <p className="mb-3 font-label text-accent">Brand</p>
          <h2 className="mb-8 font-editorial text-4xl">Logo and colours</h2>

          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-center rounded-2xl border border-border bg-foreground p-10">
              <VendoraLogo size="md" color="#f4f1ea" withTagline />
            </div>
            <div className="flex items-center justify-center rounded-2xl border border-border bg-background p-10">
              <VendoraLogo size="md" color="#14161a" />
            </div>
          </div>

          <p className="mb-6 text-sm leading-relaxed text-foreground">
            Use the logo on Ink (#14161A) or Ivory (#F4F1EA). Don't stretch,
            recolour or rotate it, or add effects. Need a logo file? Email us.
          </p>

          <div className="mb-10 flex flex-wrap items-center gap-3 text-xs">
            <a
              href="/pwa-512.png"
              download
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-bold transition-colors hover:border-foreground/30"
            >
              <Download className="h-3 w-3" />
              App icon (512×512)
            </a>
            <a
              href="/pwa-192.png"
              download
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-bold transition-colors hover:border-foreground/30"
            >
              <Download className="h-3 w-3" />
              App icon (192×192)
            </a>
          </div>

          <h3 className="mb-4 font-editorial text-2xl">Colours</h3>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {PALETTE.map((c) => (
              <div key={c.name}>
                <div
                  className={`h-16 rounded-2xl ${c.light ? "border border-border" : ""}`}
                  style={{ backgroundColor: c.hex }}
                />
                <p className="mt-2 text-sm font-bold">{c.name}</p>
                <p className="m-0 text-[11px] tnum text-foreground">{c.hex}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="border-t border-border py-14 md:py-20">
        <div className="container mx-auto max-w-3xl px-5 text-center md:px-8">
          <p className="mb-3 font-label text-accent">Contact</p>
          <h2 className="mb-3 font-editorial text-4xl">Let's talk</h2>
          <p className="mx-auto mb-8 max-w-xl text-base leading-relaxed text-foreground">
            Editorial requests, interviews and partnership inquiries. We read
            every message.
          </p>
          {emailButton}
        </div>
      </section>

      <Footer />
    </div>
  );
}
