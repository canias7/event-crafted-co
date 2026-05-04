import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Loader2, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

interface InviteData {
  email: string;
  role_label: string;
  accepted: boolean;
  event: {
    id: string;
    name: string | null;
    event_type: string;
    event_date: string | null;
    event_location: string | null;
    host_name: string;
  };
}

const EVENT_LABEL: Record<string, string> = {
  wedding: "Wedding",
  birthday: "Birthday",
  holiday_dinner: "Holiday gathering",
  other: "Event",
};

export default function AcceptPartyInvitePage() {
  const { token } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result, error: err } = await (supabase as any).rpc(
        "get_party_invite_by_token",
        { p_token: token },
      );
      if (cancelled) return;
      if (err || !result?.ok) {
        setError(result?.error ?? "Invitation not found");
        setLoading(false);
        return;
      }
      setData(result as InviteData);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function accept() {
    if (!user) {
      navigate(`/signup?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setAccepting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: result, error: err } = await (supabase as any).rpc(
      "accept_party_invite",
      { p_token: token },
    );
    setAccepting(false);
    if (err || !result?.ok) {
      toast.error(result?.error ?? err?.message ?? "Couldn't accept");
      return;
    }
    toast.success("You're in");
    navigate(`/party/${result.event_id}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
          <h1 className="font-display text-2xl mb-2">
            Invitation not found
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {error ?? "This invite may have expired or been revoked."}
          </p>
          <Link to="/">
            <Button variant="outline" className="rounded-full">
              Back to Vendora
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="max-w-md w-full text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-accent/15 flex items-center justify-center mb-5">
          <Sparkles className="w-5 h-5 text-accent" />
        </div>
        <p className="text-xs uppercase tracking-[0.4em] text-accent mb-3">
          You're invited
        </p>
        <h1 className="font-display text-3xl md:text-4xl leading-tight mb-3">
          {data.event.host_name} added you to their inner circle
        </h1>
        <p className="text-sm text-muted-foreground mb-1">
          As <span className="text-foreground/85">{data.role_label}</span>
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          {EVENT_LABEL[data.event.event_type] ?? "Event"}
          {data.event.event_date && (
            <>
              {" · "}
              <span className="tnum">
                {new Date(`${data.event.event_date}T00:00:00`).toLocaleDateString(
                  undefined,
                  { weekday: "long", month: "long", day: "numeric" },
                )}
              </span>
            </>
          )}
          {data.event.event_location && ` · ${data.event.event_location}`}
        </p>

        {data.accepted ? (
          <>
            <div className="inline-flex items-center gap-2 text-sm text-accent mb-4">
              <CheckCircle2 className="w-4 h-4" />
              You've already accepted this invitation
            </div>
            <Link to={`/party/${data.event.id}`} className="block">
              <Button className="rounded-full bg-foreground text-background hover:bg-foreground/90">
                Open the VIP portal
              </Button>
            </Link>
          </>
        ) : !user ? (
          <>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              Sign in or create an account with{" "}
              <span className="text-foreground/85">{data.email}</span> to
              accept and access the portal.
            </p>
            <div className="flex gap-2 justify-center">
              <Link
                to={`/login?next=${encodeURIComponent(window.location.pathname)}`}
              >
                <Button variant="outline" className="rounded-full">
                  Sign in
                </Button>
              </Link>
              <Link
                to={`/signup?next=${encodeURIComponent(window.location.pathname)}`}
              >
                <Button className="rounded-full bg-foreground text-background hover:bg-foreground/90">
                  Create account
                </Button>
              </Link>
            </div>
          </>
        ) : (
          <Button
            onClick={accept}
            disabled={accepting}
            className="rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            {accepting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-2" />
            )}
            Accept invitation
          </Button>
        )}
      </div>
    </div>
  );
}
