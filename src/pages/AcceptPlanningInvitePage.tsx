import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Loader2, Check, AlertCircle, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";

interface InviteSummary {
  id: string;
  email: string;
  role: "editor" | "viewer";
  expires_at: string;
  accepted_at: string | null;
  host_name: string | null;
}

export default function AcceptPlanningInvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { session, refreshProfile } = useAuth();

  const [invite, setInvite] = useState<InviteSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .rpc("get_planning_invite_by_token", { p_token: token })
      .then(({ data, error }) => {
          if (cancelled) return;
          if (error || !data) {
            setNotFound(true);
          } else {
            setInvite(data as unknown as InviteSummary);
          }
          setLoading(false);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function accept() {
    if (!token) return;
    setAccepting(true);
    setErrorMsg(null);
    const { data, error } = await supabase.rpc("accept_planning_invite", {
      p_token: token,
    });
    setAccepting(false);
    if (error) {
      setErrorMsg(error.message);
      toast.error(error.message);
      return;
    }
    const result = data as { ok: boolean; error?: string } | null;
    if (!result?.ok) {
      const map: Record<string, string> = {
        not_authenticated: "Sign in first to accept this invite.",
        invite_not_found: "This invite link is invalid.",
        already_accepted: "This invite has already been accepted.",
        expired: "This invite has expired. Ask for a new one.",
        email_mismatch:
          "Sign in with the email address this invite was sent to.",
        self_invite: "You can't accept an invite to your own workspace.",
      };
      const msg = map[result?.error ?? ""] ?? "Couldn't accept this invite.";
      setErrorMsg(msg);
      toast.error(msg);
      return;
    }
    toast.success("You're on the planning team");
    await refreshProfile();
    navigate("/customer/dashboard");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading invite…</p>
      </div>
    );
  }

  if (notFound || !invite) {
    return (
      <div className="min-h-screen bg-background">
        <PublicNav />
        <div className="container mx-auto px-6 md:px-8 py-32 text-center max-w-md">
          <div className="w-12 h-12 mx-auto rounded-full bg-secondary flex items-center justify-center mb-4">
            <AlertCircle className="w-5 h-5 text-muted-foreground" />
          </div>
          <h1 className="font-display text-2xl mb-3">Invite not found</h1>
          <p className="text-sm text-muted-foreground mb-6">
            This link is invalid or has been revoked.
          </p>
          <Link to="/">
            <Button className="rounded-full bg-foreground text-background hover:bg-foreground/90">
              Back to Vendora
            </Button>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  if (invite.accepted_at) {
    return (
      <div className="min-h-screen bg-background">
        <PublicNav />
        <div className="container mx-auto px-6 md:px-8 py-32 text-center max-w-md">
          <div className="w-12 h-12 mx-auto rounded-full bg-secondary flex items-center justify-center mb-4">
            <Check className="w-5 h-5 text-muted-foreground" />
          </div>
          <h1 className="font-display text-2xl mb-3">Already accepted</h1>
          <p className="text-sm text-muted-foreground mb-6">
            This invite was already used. Sign in to access the workspace.
          </p>
          <Link to="/login">
            <Button className="rounded-full bg-foreground text-background hover:bg-foreground/90">
              Sign in
            </Button>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const isExpired = new Date(invite.expires_at) < new Date();

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <div className="container mx-auto px-6 md:px-8 py-20 max-w-md">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-secondary flex items-center justify-center mb-4">
            <Users className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="font-label text-accent tracking-[0.3em] mb-3">
            — PLANNING INVITE
          </p>
          <h1 className="font-display text-3xl md:text-4xl leading-tight mb-3">
            Help {invite.host_name ?? "a host"} plan their event
          </h1>
          <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
            You've been invited as a{" "}
            <span className="text-foreground font-medium">{invite.role}</span>.
            {invite.role === "editor"
              ? " You'll be able to edit guests, checklist, budget, mood boards, and timeline."
              : " You'll be able to see the guest list, checklist, budget, mood boards, and timeline."}
          </p>

          {isExpired ? (
            <div className="rounded-sm border border-destructive/30 bg-destructive/5 p-4 mb-6 text-sm text-destructive">
              This invite has expired. Ask for a new one.
            </div>
          ) : !session ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Sign in to accept. The invite was sent to{" "}
                <span className="text-foreground font-medium">
                  {invite.email}
                </span>
                .
              </p>
              <Link
                to={`/login?next=${encodeURIComponent(`/accept-planning-invite/${token}`)}`}
              >
                <Button className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90">
                  Sign in to accept
                </Button>
              </Link>
              <Link
                to={`/signup?email=${encodeURIComponent(invite.email)}&next=${encodeURIComponent(`/accept-planning-invite/${token}`)}`}
              >
                <Button variant="outline" className="w-full rounded-full">
                  Create an account
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {errorMsg && (
                <div className="rounded-sm border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {errorMsg}
                </div>
              )}
              <Button
                onClick={accept}
                disabled={accepting}
                className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                {accepting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Accept and join the team
              </Button>
              <p className="text-xs text-muted-foreground">
                Signed in as {session.user.email}
              </p>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
