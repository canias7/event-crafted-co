import { motion } from "framer-motion";
import { Search, Calendar, Sparkles, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { Button } from "@/components/ui/button";

const steps = [
  {
    icon: Search,
    title: "Discover & browse",
    desc: "Search our curated marketplace of verified vendors. Filter by category, location, price, and availability. Read real reviews and view portfolios.",
    details: ["Browse by category or keyword", "View detailed vendor profiles", "Compare pricing and packages", "Check real-time availability"],
  },
  {
    icon: Calendar,
    title: "Book & plan",
    desc: "Schedule appointments, set your event date, and organize every detail. Our planning tools keep you on track from start to finish.",
    details: ["Schedule video calls, phone, or in-person meetings", "Set your event date and build a timeline", "Create a custom checklist for your event", "Manage tasks with priorities and due dates"],
  },
  {
    icon: Sparkles,
    title: "Create & celebrate",
    desc: "Design stunning invitations, process secure payments, and bring your event to life with confidence.",
    details: ["Design digital or printable invitations", "Track RSVPs and manage your guest list", "Pay deposits and invoices securely", "Enjoy your perfectly planned event"],
  },
];

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <div className="pt-32 pb-24">
        <div className="container mx-auto px-4 md:px-8 max-w-3xl">
          <div className="text-center mb-16">
            <p className="font-label text-accent mb-3">How It Works</p>
            <h1 className="text-hero font-display mb-4">Planning made simple</h1>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              From discovering the perfect vendor to celebrating your big day, we've streamlined every step.
            </p>
          </div>

          <div className="space-y-12">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ type: "spring", duration: 0.4, bounce: 0, delay: i * 0.1 }}
                className="bg-card rounded-2xl card-shadow p-6 md:p-8"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <step.icon className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <p className="font-label text-accent mb-1">Step {i + 1}</p>
                    <h2 className="font-display text-xl">{step.title}</h2>
                  </div>
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed mb-4 ml-14">{step.desc}</p>
                <ul className="ml-14 space-y-2">
                  {step.details.map((detail, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                      {detail}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-16">
            <Link to="/customer/dashboard">
              <Button size="lg" className="h-12 px-8 rounded-lg">
                Start Planning Now <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
