// Sign-in role chooser. The single /login route in PublicNav lands here;
// the user picks Host vs Vendor and we forward to the role-specific
// form at /login/host or /login/vendor.
//
// We keep this as a separate "fork" page rather than tabs in LoginPage
// because the visual difference (two big tap targets) is the whole
// point — anything subtler defeats the clarity goal.

import { Link } from "react-router-dom";
import { CalendarHeart, Briefcase, ArrowRight } from "lucide-react";

export default function LoginRoleChooserPage() {
  return (
    <div className="min-h-screen flex">
      <div className="hidden md:block md:w-1/2 relative overflow-hidden bg-background">
        {/* Vendora animated brand intro — hosted as a static HTML doc
            in /public so the choreographed CSS / vanilla JS animation
            doesn't have to be re-implemented in React. */}
        <iframe
          src="/vendora-intro.html"
          title="Vendora"
          className="absolute inset-0 w-full h-full border-0"
          loading="eager"
        />
      </div>

      <div className="flex-1 flex flex-col md:items-center md:justify-center px-6 pt-12 pb-12 md:p-12 bg-background">
        <div className="w-full max-w-sm">
          <Link to="/" className="md:hidden font-editorial text-3xl block mb-8">
            Vendora
          </Link>

          <h1 className="font-editorial text-4xl md:text-5xl mb-2 leading-tight">
            How are you signing in?
          </h1>
          <p className="text-sm text-muted-foreground mb-10">
            Pick the side you're on — we'll route you to the right dashboard.
          </p>

          <div className="space-y-3">
            <Link
              to="/login/host"
              className="card-soft group flex items-center gap-4 p-5 transition hover:shadow-md"
            >
              <div className="grid h-11 w-11 place-items-center rounded-full bg-muted text-foreground">
                <CalendarHeart className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-editorial text-xl leading-tight">Host sign in</p>
                <p className="text-xs text-muted-foreground">
                  Plan events, message vendors, manage bookings.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
            </Link>

            <Link
              to="/login/vendor"
              className="card-soft group flex items-center gap-4 p-5 transition hover:shadow-md"
            >
              <div className="grid h-11 w-11 place-items-center rounded-full bg-muted text-foreground">
                <Briefcase className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-editorial text-xl leading-tight">Vendor sign in</p>
                <p className="text-xs text-muted-foreground">
                  Manage inquiries, your listing, packages, and calendar.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
            </Link>
          </div>

          <p className="text-sm text-muted-foreground mt-10 text-center">
            New to Vendora?{" "}
            <Link to="/signup" className="text-accent font-medium">
              Create an account
            </Link>
          </p>
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Vendor?{" "}
            <Link to="/vendor-apply" className="text-accent">
              Apply to list
            </Link>{" "}
            — every listing is hand-reviewed before going live.
          </p>
        </div>
      </div>
    </div>
  );
}
