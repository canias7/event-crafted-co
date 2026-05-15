// Sign-up role chooser. /signup lands here; the user picks Host or
// Vendor and we forward them to the right intake.
//
// Hosts: /signup/host (the existing self-serve form, unchanged).
// Vendors: /vendor-apply (a hand-reviewed application — every listing
// is approved before going live, so this is a different flow with
// portfolio + business detail steps, not a quick signup).

import { Link } from "react-router-dom";
import { CalendarHeart, Briefcase, ArrowRight } from "lucide-react";
import { Picture } from "@/components/shared/Picture";
import heroImg from "@/assets/vendora-hero-dinner.jpg?as=picture";

export default function SignupRoleChooserPage() {
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
          <Link to="/" className="font-editorial text-3xl">
            Vendora
          </Link>
          <div>
            <div className="flex items-center gap-3 mb-5">
              <p className="font-label text-accent tracking-[0.4em]">
                JOIN VENDORA
              </p>
              <span className="h-px w-8 bg-accent/40" />
            </div>
            <p className="text-3xl lg:text-4xl font-display leading-[1.1] max-w-sm">
              Curated vendors,{" "}
              <span className="italic font-light text-accent">
                carefully matched
              </span>
            </p>
            <p className="text-sm text-background/70 mt-5 max-w-sm leading-relaxed">
              Hosts join in seconds. Vendors are hand-reviewed before listing.
            </p>
          </div>
          <p className="text-xs text-background/50 tracking-wide">
            Curated event vendors. Verified hosts. Privately matched.
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:items-center md:justify-center px-6 pt-12 pb-12 md:p-12 bg-background">
        <div className="w-full max-w-sm">
          <Link to="/" className="md:hidden font-editorial text-3xl block mb-8">
            Vendora
          </Link>

          <h1 className="font-editorial text-4xl md:text-4xl mb-2 leading-tight">
            Create an account
          </h1>
          <p className="text-sm text-muted-foreground mb-10">
            Are you planning an event, or do you run a service?
          </p>

          <div className="space-y-3">
            <Link
              to="/signup/host"
              className="group flex items-center gap-4 rounded-2xl border border-border bg-background p-5 transition hover:border-foreground hover:shadow-sm"
            >
              <div className="grid h-11 w-11 place-items-center rounded-full bg-muted text-foreground">
                <CalendarHeart className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-editorial text-xl leading-tight">
                  I'm planning an event
                </p>
                <p className="text-xs text-muted-foreground">
                  Sign up as a host. Free, takes a minute.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
            </Link>

            <Link
              to="/vendor-apply"
              className="group flex items-center gap-4 rounded-2xl border border-border bg-background p-5 transition hover:border-foreground hover:shadow-sm"
            >
              <div className="grid h-11 w-11 place-items-center rounded-full bg-muted text-foreground">
                <Briefcase className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-editorial text-xl leading-tight">
                  I'm a vendor
                </p>
                <p className="text-xs text-muted-foreground">
                  Apply to list your service. Hand-reviewed before going live.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
            </Link>
          </div>

          <p className="text-sm text-muted-foreground mt-10 text-center">
            Already have an account?{" "}
            <Link to="/login" className="text-accent font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
