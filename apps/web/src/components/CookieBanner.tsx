import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "vendora.cookie-consent";

type Choice = "all" | "essential";

export function CookieBanner() {
  const { t } = useTranslation("shell");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Show only when no decision is recorded yet.
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      // Brief delay so the banner doesn't fight first-paint animations
      const timer = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  function decide(choice: Choice) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ choice, decidedAt: new Date().toISOString() }),
    );
    // Lets analytics on the open page start right away (the homepage test
    // counts a visit seen before the choice was made).
    window.dispatchEvent(new CustomEvent("vendora:cookie-consent", { detail: choice }));
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
          <div className="bg-foreground text-background rounded-2xl shadow-lifted p-5 relative">
            <button
              onClick={() => decide("essential")}
              aria-label={t("cookies.dismiss")}
              className="absolute top-3 right-3 text-background/60 hover:text-background"
            >
              <X className="w-4 h-4" />
            </button>
            <p className="font-display text-base mb-2">{t("cookies.title")}</p>
            <p className="text-xs text-background/75 leading-relaxed mb-4">
              <Trans
                t={t}
                i18nKey="cookies.body"
                components={{
                  policy: (
                    <Link
                      to="/privacy"
                      onClick={() => decide("essential")}
                      className="text-accent font-medium underline-offset-2 hover:underline"
                    />
                  ),
                }}
              />
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => decide("all")}
                className="flex-1"
              >
                {t("cookies.accept_all")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => decide("essential")}
                className="text-background hover:bg-background/10 hover:text-background flex-1"
              >
                {t("cookies.essential_only")}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
