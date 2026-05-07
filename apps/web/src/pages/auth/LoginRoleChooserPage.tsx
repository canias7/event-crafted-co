// Sign-in role chooser. The single /login route in PublicNav lands here;
// the user picks Host vs Vendor and we forward to the role-specific
// form at /login/host or /login/vendor.
//
// We keep this as a separate "fork" page rather than tabs in LoginPage
// because the visual difference (two big tap targets) is the whole
// point — anything subtler defeats the clarity goal.

import { Link } from "react-router-dom";
import { CalendarHeart, Briefcase, ArrowRight } from "lucide-react";
import { Picture } from "@/components/shared/Picture";
import heroImg from "@/assets/vendora-hero-cinematic.jpg?as=picture";

export default function LoginRoleChooserPage() {
  return (
    <div className="min-h-screen flex">
      <div className="hidden md:flex md:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0">
          <Picture
            source={heroImg}
            alt=""
            loading="eager"
            fetchPriority="high"
            sizes="50vw"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-br from-foreground/85 via-foreground/60 to-foreground/35" />
        <div className="relative z-10 flex flex-col justify-between p-10 lg:p-14 text-background w-full">
          <Link to="/" className="font-display text-2xl">
            Vendora
          </Link>
          <div>
            <div className="flex items-center gap-3 mb-5">
              <p className="font-label text-accent tracking-[0.4em]">
                SIGN IN
              </p>
              <span className="h-px w-8 bg-accent/40" />
            </div>
            <p className="text-3xl lg:text-4xl font-display leading-[1.1] max-w-sm">
              Welcome back to{" "}
              <span className="italic font-light text-accent">Vendora</span>
            </p>
          </div>
          <p className="text-xs text-background/50 tracking-wide">
            Curated event vendors. Verified hosts. Privately matched.
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:items-center md:justify-center px-6 pt-12 pb-12 md:p-12 bg-background">
        <div className="w-full max-w-sm">
          <Link to="/" className="md:hidden font-display text-2xl block mb-8">
            Vendora
          </Link>

          <h1 className="font-display text-3xl md:text-4xl mb-2 leading-tight">
            How are you signing in?
          </h1>
          <p className="text-sm text-muted-foreground mb-10">
            Pick the side you're on — we'll route you to the right dashboard.
          </p>

          <div className="space-y-3">
            <Link
              to="/login/host"
              className="group flex items-center gap-4 rounded-2xl border border-border bg-background p-5 transition hover:border-foreground hover:shadow-sm"
            >
              <div className="grid h-11 w-11 place-items-center rounded-full bg-muted text-foreground">
                <CalendarHeart className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-display text-lg leading-tight">Host sign in</p>
                <p className="text-xs text-muted-foreground">
                  Plan events, message vendors, manage bookings.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
            </Link>

            <Link
              to="/login/vendor"
              className="group flex items-center gap-4 rounded-2xl border border-border bg-background p-5 transition hover:border-foreground hover:shadow-sm"
            >
              <div className="grid h-11 w-11 place-items-center rounded-full bg-muted text-foreground">
                <Briefcase className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-display text-lg leading-tight">Vendor sign in</p>
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
