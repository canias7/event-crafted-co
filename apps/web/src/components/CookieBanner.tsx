import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Trans, useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

// A notice, not a consent prompt: the site only uses what it needs to
// run (sign-in session and language in browser storage, plus Sentry
// error reports), with no analytics or ad cookies, so there is nothing
// to opt in or out of. Dismissal is remembered under the same key as
// the old consent banner, so people who answered that one aren't asked
// again.
const STORAGE_KEY = "vendora.cookie-consent";

export function CookieBanner() {
  const { t } = useTranslation("shell");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage blocked: show the notice; dismissing just closes it.
    }
    if (!stored) {
      // Brief delay so the banner doesn't fight first-paint animations
      const timer = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ choice: "acknowledged", decidedAt: new Date().toISOString() }),
      );
    } catch {
      // Storage blocked: nothing to remember it in.
    }
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
          <div
            role="region"
            aria-label={t("cookies.title")}
            className="bg-popover text-foreground border border-border rounded-2xl shadow-lifted p-5"
          >
            <p className="font-display text-base mb-2">{t("cookies.title")}</p>
            <p className="text-xs text-foreground/85 leading-relaxed mb-4">
              <Trans
                t={t}
                i18nKey="cookies.body"
                components={{
                  privacy: (
                    <Link
                      to="/privacy"
                      onClick={dismiss}
                      className="text-accent font-medium underline-offset-2 hover:underline"
                    />
                  ),
                }}
              />
            </p>
            <Button size="sm" onClick={dismiss} className="w-full">
              {t("cookies.got_it")}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
