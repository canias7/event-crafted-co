import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";

const spring = { type: "spring" as const, duration: 0.6, bounce: 0 };

export default function VendorApplyThanksPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <section className="py-24 md:py-32">
        <div className="container mx-auto px-6 md:px-8 max-w-xl text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={spring}
            className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 text-accent mb-8"
          >
            <CheckCircle2 className="h-8 w-8" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.1 }}
            className="font-display text-4xl md:text-5xl leading-tight mb-4"
          >
            Thank you for applying.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.2 }}
            className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-md mx-auto"
          >
            Our team hand-reviews every Vendora application. We'll email you
            within 2–3 business days with the decision. If approved, you'll be
            able to sign in and finish setting up your listing.
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...spring, delay: 0.35 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <Button
              asChild
              variant="outline"
              className="rounded-full"
            >
              <Link to="/">Back to home</Link>
            </Button>
            <Button
              asChild
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              <Link to="/vendors">
                Explore the marketplace
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
