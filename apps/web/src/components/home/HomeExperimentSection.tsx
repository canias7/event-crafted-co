import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  analyticsAllowed,
  homeAssignment,
  logHomeEvent,
  previewVariant,
  recordHomeVisit,
  type HomeVariant,
} from "@/lib/homeExperiment";
import { CategoryShowcaseSection } from "./CategoryShowcaseSection";
import { PlanningPickerSection } from "./PlanningPickerSection";
import { HowItWorksSection } from "./HowItWorksSection";
import type { TrackHomeEvent } from "./HomeSectionShell";

const VIEWED_KEY = "vendora.home-test.viewed";

// The section right under the homepage hero: the visitor's homepage-test
// version (see lib/homeExperiment). With analytics consent it records that
// the visitor got this version, a "view" once per browser session when the
// section's top has scrolled a quarter of the way up the screen (the same
// for all three, however tall each is), and every click or pick inside it.
// ?home=a|b|c previews a version: no version is given, nothing is recorded.
export function HomeExperimentSection() {
  const { search } = useLocation();
  const preview = previewVariant(search);
  // The visitor's own version, picked the first time they see the real
  // homepage.
  const own = useRef<HomeVariant | null>(null);
  const variant = preview ?? (own.current ??= homeAssignment().variant);
  const ref = useRef<HTMLDivElement>(null);

  const track = useCallback<TrackHomeEvent>(
    (event, detail) => {
      if (!preview) logHomeEvent(event, detail);
    },
    [preview],
  );

  useEffect(() => {
    if (!preview) recordHomeVisit();
  }, [preview]);

  useEffect(() => {
    const el = ref.current;
    if (preview || !el || typeof IntersectionObserver === "undefined") return;
    let seen = false;
    const loggedThisSession = () => {
      try {
        return sessionStorage.getItem(VIEWED_KEY) === "1";
      } catch {
        return false;
      }
    };
    const logView = () => {
      if (!seen || loggedThisSession() || !analyticsAllowed()) return;
      try {
        sessionStorage.setItem(VIEWED_KEY, "1");
      } catch {
        // No session storage: a view may be counted again next load.
      }
      logHomeEvent("view");
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          seen = true;
          observer.disconnect();
          logView();
        }
      },
      { rootMargin: "0px 0px -25% 0px" },
    );
    observer.observe(el);
    // Seen before choosing in the cookie banner: count it once they accept.
    window.addEventListener("vendora:cookie-consent", logView);
    return () => {
      observer.disconnect();
      window.removeEventListener("vendora:cookie-consent", logView);
    };
  }, [preview]);

  return (
    <div ref={ref} data-home-variant={variant}>
      {variant === "a" ? (
        <CategoryShowcaseSection onTrack={track} />
      ) : variant === "b" ? (
        <PlanningPickerSection onTrack={track} />
      ) : (
        <HowItWorksSection onTrack={track} />
      )}
    </div>
  );
}
