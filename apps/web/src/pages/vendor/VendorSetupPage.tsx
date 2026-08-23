// Vendor setup checklist — web twin of the app's /(vendor)/setup screen.
//
// The "how far is this vendor from being discoverable?" logic lives in
// @vendora/core (loadSetupState) so both surfaces compute the same
// items from the same data. This page only renders them and maps each
// item's abstract `route` to a web path.
//
// The listing rows point at /vendor/me rather than a listing route:
// on the web the listing editor is a modal launched from My Profile,
// not a page of its own.

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { loadSetupState, type SetupItem, type SetupState } from "@vendora/core";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems as navItems } from "@/data/navItems";
import { Skeleton } from "@/components/ui/skeleton";

const PATH_FOR: Record<NonNullable<SetupItem["route"]>, string> = {
  "edit-profile": "/vendor/edit-profile",
  listing: "/vendor/me",
  calendar: "/vendor/appointments",
};

export default function VendorSetupPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<SetupState | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      setState(await loadSetupState(supabase, user.id));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Coming back from an editor should reflect what was just filled in.
  useEffect(() => {
    function onFocus() {
      void load();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const pct = state
    ? Math.round((state.requiredDone / state.requiredTotal) * 100)
    : 0;

  return (
    <div className="min-h-screen flex relative bg-[var(--vendor-canvas)]">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />
      <main className="flex-1 min-w-0 pb-24 lg:pb-0">
        <div
          className="px-4 md:px-8 pt-8 pb-6"
          style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}
        >
          <h1 className="text-3xl md:text-4xl tracking-tight">
            {state?.complete ? "All set" : "Finish setting up"}{" "}
            <span className="text-accent">✦</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {state?.complete
              ? "Your profile is complete — hosts can find you."
              : "A few steps left before hosts can find you."}
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-[760px] space-y-5">
          {loading && !state ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full rounded-sm" />
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[72px] w-full rounded-sm" />
              ))}
            </div>
          ) : !state ? null : (
            <>
              <section
                className="rounded-sm border bg-card p-5"
                aria-label="Setup progress"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm font-medium">
                    {state.requiredDone} of {state.requiredTotal} complete
                  </span>
                  <span className="text-sm tabular-nums text-accent font-semibold">
                    {pct}%
                  </span>
                </div>
                <div
                  className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary"
                  role="progressbar"
                  aria-valuenow={state.requiredDone}
                  aria-valuemin={0}
                  aria-valuemax={state.requiredTotal}
                  aria-label="Setup progress"
                >
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </section>

              <ul className="space-y-2">
                {state.items.map((item) => {
                  const path = item.route ? PATH_FOR[item.route] : null;
                  const Row = path ? "button" : "div";
                  return (
                    <li key={item.key}>
                      <Row
                        {...(path
                          ? {
                              type: "button" as const,
                              onClick: () => navigate(path),
                            }
                          : {})}
                        className={`w-full rounded-sm border bg-card p-4 text-left flex items-start gap-3 ${
                          path
                            ? "hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                            : ""
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                            item.done
                              ? "border-transparent bg-accent text-accent-foreground"
                              : "border-border"
                          }`}
                        >
                          {item.done ? <Check className="h-3.5 w-3.5" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">
                            {item.title}
                            {item.optional ? (
                              <span className="ml-2 text-xs text-muted-foreground">
                                Optional
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-sm text-muted-foreground">
                            {item.subtitle}
                          </span>
                        </span>
                        {path && !item.done ? (
                          <ArrowRight
                            aria-hidden
                            className="mt-1 h-4 w-4 shrink-0 text-accent"
                          />
                        ) : null}
                      </Row>
                    </li>
                  );
                })}
              </ul>

              {loading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Refreshing…
                </p>
              ) : null}
            </>
          )}
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}
