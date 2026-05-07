import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "vendora.cookie-consent";

type Choice = "all" | "essential";

export function CookieBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Show only when no decision is recorded yet.
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      // Brief delay so the banner doesn't fight first-paint animations
      const t = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  function decide(choice: Choice) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ choice, decidedAt: new Date().toISOString() }),
    );
    setOpen(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-4 left-4 right-4 md:left-6 md:right-auto md:max-w-md z-50"
        >
          <div className="bg-foreground text-background rounded-sm shadow-2xl p-5 relative">
            <button
              onClick={() => decide("essential")}
              aria-label="Dismiss"
              className="absolute top-3 right-3 text-background/60 hover:text-background"
            >
              <X className="w-4 h-4" />
            </button>
            <p className="font-display text-base mb-2">Cookies, briefly</p>
            <p className="text-xs text-background/75 leading-relaxed mb-4">
              We use essential cookies to keep you signed in, and (with your
              consent) analytics cookies to understand which features get used.
              We don't sell data and we don't use ad-tracking cookies. See our{" "}
              <Link
                to="/privacy"
                onClick={() => decide("essential")}
                className="text-accent font-medium underline-offset-2 hover:underline"
              >
                Privacy Policy
              </Link>
              .
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => decide("all")}
                className="rounded-full bg-background text-foreground hover:bg-background/90 flex-1"
              >
                Accept all
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => decide("essential")}
                className="rounded-full text-background hover:bg-background/10 hover:text-background flex-1"
              >
                Essential only
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
