import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Search, Calendar, CheckCircle, Star, ChevronDown, Sparkles, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { VendorCard } from "@/components/shared/VendorCard";
import { vendors, testimonials } from "@/data/sampleData";
import heroImage from "@/assets/hero-event.jpg";

const spring = { type: "spring" as const, duration: 0.4, bounce: 0 };

const faqs = [
  { q: "How does the booking process work?", a: "Browse vendors, view their profiles and availability, then book directly through the platform. You'll receive a confirmation and can manage everything from your dashboard." },
  { q: "Are vendors verified?", a: "Every vendor goes through a rigorous application and review process. We verify credentials, review portfolios, and check references before approval." },
  { q: "How are payments handled?", a: "Payments are processed securely through the platform. You can pay deposits, installments, or full amounts. Receipts and invoices are generated automatically." },
  { q: "Can I create digital invitations?", a: "Yes! Our built-in invitation builder lets you design beautiful digital or printable invitations with customizable templates, RSVP tracking, and sharing options." },
  { q: "What if I need to cancel a booking?", a: "Cancellation policies vary by vendor. You can view each vendor's policy on their profile before booking. Refund requests are handled through the platform." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      {/* Hero */}
      <section className="relative pt-32 pb-24 md:pt-40 md:pb-32 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <img src={heroImage} alt="" className="w-full h-full object-cover opacity-15" />
          <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background" />
        </div>
        <div className="container mx-auto px-4 md:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.1 }}
          >
            <p className="font-label text-accent mb-6">Event Planning, Elevated</p>
            <h1 className="text-hero font-display max-w-3xl mx-auto mb-6">
              Your event, perfectly composed.
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-10 leading-relaxed">
              From finding the right vendors to designing the invitations, we bring everything together in one calm, beautiful platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/vendors">
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} transition={spring}>
                  <Button size="lg" className="h-12 px-8 rounded-lg text-base">
                    <Search className="w-4 h-4 mr-2" />
                    Find Vendors
                  </Button>
                </motion.div>
              </Link>
              <Link to="/customer/dashboard">
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} transition={spring}>
                  <Button size="lg" variant="outline" className="h-12 px-8 rounded-lg text-base">
                    Start Planning
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </motion.div>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 md:py-32">
        <div className="container mx-auto px-4 md:px-8">
          <div className="text-center mb-16">
            <p className="font-label text-accent mb-3">How It Works</p>
            <h2 className="text-h2 font-display">Three steps to your perfect event</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Search, title: "Discover vendors", desc: "Browse curated profiles with real reviews, pricing, and availability. Filter by category, location, and budget." },
              { icon: Calendar, title: "Book & plan", desc: "Schedule appointments, set your event date, build your checklist, and manage tasks — all in one dashboard." },
              { icon: Sparkles, title: "Create & celebrate", desc: "Design stunning invitations, track RSVPs, process payments, and bring your vision to life." },
            ].map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...spring, delay: i * 0.1 }}
                className="text-center md:text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4 mx-auto md:mx-0">
                  <step.icon className="w-5 h-5 text-accent" />
                </div>
                <h3 className="font-display text-lg mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured vendors */}
      <section className="py-24 md:py-32 bg-secondary/30">
        <div className="container mx-auto px-4 md:px-8">
          <div className="flex items-end justify-between mb-12">
            <div>
              <p className="font-label text-accent mb-3">Featured Vendors</p>
              <h2 className="text-h2 font-display">Trusted by the best</h2>
            </div>
            <Link to="/vendors" className="hidden md:block">
              <Button variant="ghost" className="text-sm">
                View all vendors <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vendors.slice(0, 6).map((vendor) => (
              <VendorCard key={vendor.id} vendor={vendor} />
            ))}
          </div>
          <div className="mt-8 text-center md:hidden">
            <Link to="/vendors">
              <Button variant="outline">View all vendors</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Invitation preview */}
      <section className="py-24 md:py-32">
        <div className="container mx-auto px-4 md:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="font-label text-accent mb-3">Invitation Builder</p>
              <h2 className="text-h2 font-display mb-4">Design invitations that inspire</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Choose from elegant templates, customize every detail, and share digitally or print. Track RSVPs and manage your guest list effortlessly.
              </p>
              <div className="space-y-3">
                {["Customizable templates for every event", "Live preview as you design", "Digital sharing with QR codes", "Print-ready export"].map((feature, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <CheckCircle className="w-4 h-4 text-accent flex-shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
              <Link to="/customer/invitations" className="inline-block mt-8">
                <Button>
                  <Send className="w-4 h-4 mr-2" />
                  Try the Builder
                </Button>
              </Link>
            </div>
            <div className="bg-card rounded-2xl card-shadow p-8 md:p-12">
              <div className="border border-border rounded-xl p-8 text-center space-y-4">
                <p className="font-label text-accent">You're Invited</p>
                <h3 className="font-display text-2xl">Sarah & James</h3>
                <p className="text-muted-foreground text-sm">Request the pleasure of your company</p>
                <div className="w-12 h-[1px] bg-border mx-auto" />
                <div className="text-sm space-y-1">
                  <p className="font-medium">Saturday, August 15, 2026</p>
                  <p className="text-muted-foreground">Six o'clock in the evening</p>
                  <p className="text-muted-foreground">The Grand Atelier</p>
                </div>
                <p className="text-xs text-muted-foreground pt-4">Black Tie Optional · RSVP by July 15</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 md:py-32 bg-secondary/30">
        <div className="container mx-auto px-4 md:px-8">
          <div className="text-center mb-16">
            <p className="font-label text-accent mb-3">Testimonials</p>
            <h2 className="text-h2 font-display">Loved by planners everywhere</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...spring, delay: i * 0.1 }}
                className="bg-card rounded-2xl p-6 card-shadow"
              >
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-accent text-accent" />
                  ))}
                </div>
                <p className="text-sm leading-relaxed mb-4">"{t.text}"</p>
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.event}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 md:py-32">
        <div className="container mx-auto px-4 md:px-8 max-w-2xl">
          <div className="text-center mb-16">
            <p className="font-label text-accent mb-3">FAQ</p>
            <h2 className="text-h2 font-display">Common questions</h2>
          </div>
          <div className="space-y-0">
            {faqs.map((faq, i) => (
              <details key={i} className="group border-b border-border">
                <summary className="flex items-center justify-between py-5 cursor-pointer text-sm font-medium list-none">
                  {faq.q}
                  <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="pb-5 text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 md:py-32 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 md:px-8 text-center">
          <h2 className="text-h2 font-display mb-4">Ready to start planning?</h2>
          <p className="text-sm opacity-70 max-w-md mx-auto mb-8">
            Join thousands of planners who've found their perfect vendors and created unforgettable events.
          </p>
          <Link to="/customer/dashboard">
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} transition={spring} className="inline-block">
              <Button size="lg" variant="secondary" className="h-12 px-8 rounded-lg">
                Get Started Free
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </motion.div>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
