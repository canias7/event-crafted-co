import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  analyticsAllowed,
  homeAssignment,
  logHomeEvent,
  previewVariant,
  type HomeVariant,
} from "@/lib/homeExperiment";
import { CategoryShowcaseSection } from "./CategoryShowcaseSection";
import { PlanningPickerSection } from "./PlanningPickerSection";
import { HowItWorksSection } from "./HowItWorksSection";
import type { TrackHomeEvent } from "./HomeSectionShell";

const VIEWED_KEY = "vendora.home-test.viewed";

// The section right under the homepage hero: the visitor's homepage-test
// version (see lib/homeExperiment). It records a "view" once per browser
// session when at least a quarter of it is on screen, and every click or
// pick inside it, both only with analytics consent. ?home=a|b|c previews a
// version and records nothing.
export function HomeExperimentSection() {
  const { search } = useLocation();
  const preview = previewVariant(search);
  const [assigned] = useState<HomeVariant>(() => homeAssignment().variant);
  const variant = preview ?? assigned;
  const ref = useRef<HTMLDivElement>(null);

  const track = useCallback<TrackHomeEvent>(
    (event, detail) => {
      if (!preview) logHomeEvent(event, detail);
    },
    [preview],
  );

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
      { threshold: 0.25 },
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
