import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Gift, ArrowRight, Loader2, Heart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";

interface Contributor {
  name: string;
  amount_cents: number;
  message: string | null;
  created_at: string;
}

interface SharedWish {
  id: string;
  title: string;
  description: string | null;
  target_cents: number | null;
  image_url: string | null;
  source_url: string | null;
  pledged_cents: number;
  contributors: Contributor[];
}

export default function GiftSharePage() {
  const { token } = useParams();
  const [wish, setWish] = useState<SharedWish | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Pledge form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    // Cast to any: get_gift_wish_by_token + pledge_to_gift RPCs aren't
    // in types.ts's Functions section yet.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).rpc("get_gift_wish_by_token", {
      p_token: token,
    });
    if (!data) {
      setNotFound(true);
    } else {
      setWish(data as SharedWish);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function pledge(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !name.trim() || !amount) {
      toast.error("Name and amount are required");
      return;
    }
    const cents = Math.round(Number.parseFloat(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSubmitting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("pledge_to_gift", {
      p_token: token,
      p_name: name.trim(),
      p_amount_cents: cents,
      p_email: email.trim() || null,
      p_message: message.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Pledge recorded — thank you!");
    setName("");
    setEmail("");
    setAmount("");
    setMessage("");
    load();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (notFound || !wish) {
    return (
      <div className="min-h-screen bg-background">
        <PublicNav />
        <div className="container mx-auto px-6 md:px-8 py-32 text-center max-w-md">
          <div className="w-12 h-12 mx-auto rounded-full bg-secondary flex items-center justify-center mb-4">
            <Gift className="w-5 h-5 text-muted-foreground" />
          </div>
          <h1 className="font-editorial text-3xl mb-3">Gift not found</h1>
          <p className="text-sm text-muted-foreground mb-6">
            This share link may have been removed or is incorrect.
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

  const pct = wish.target_cents
    ? Math.min(100, Math.round((wish.pledged_cents / wish.target_cents) * 100))
    : null;

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <section className="border-b border-border pt-32 pb-16">
        <div className="container mx-auto px-6 md:px-8 max-w-3xl">
          <p className="font-label text-accent tracking-[0.4em] mb-4">
            — A GROUP GIFT
          </p>
          <h1 className="font-editorial text-5xl md:text-5xl leading-[1.05] mb-4">
            {wish.title}
          </h1>
          {wish.description && (
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl leading-relaxed mb-6">
              {wish.description}
            </p>
          )}

          {wish.image_url && (
            <img
              src={wish.image_url}
              alt={wish.title}
              className="w-full max-w-md rounded-sm mb-6"
            />
          )}

          <div className="rounded-sm bg-card border border-border p-5 max-w-md">
            <div className="flex items-baseline gap-3 mb-2">
              <p className="font-editorial text-4xl tnum">
                ${Math.round(wish.pledged_cents / 100).toLocaleString()}
              </p>
              {wish.target_cents && (
                <p className="text-sm text-muted-foreground">
                  of $
                  {Math.round(wish.target_cents / 100).toLocaleString()} goal
                </p>
              )}
            </div>
            {pct !== null && <Progress value={pct} className="h-2 mb-2" />}
            <p className="text-xs text-muted-foreground">
              {wish.contributors.length}{" "}
              {wish.contributors.length === 1
                ? "contribution"
                : "contributions"}
            </p>
          </div>

          {wish.source_url && (
            <a href={wish.source_url} target="_blank" rel="noreferrer">
              <Button
                variant="ghost"
                size="sm"
                className="mt-4 rounded-full text-xs"
              >
                See product details
                <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </a>
          )}
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container mx-auto px-6 md:px-8 max-w-2xl grid md:grid-cols-2 gap-8">
          <div>
            <p className="font-label text-accent mb-4">Pledge</p>
            <form
              onSubmit={pledge}
              className="space-y-3 rounded-sm border border-border bg-card p-5"
            >
              <div className="space-y-1.5">
                <Label htmlFor="g-name">Your name</Label>
                <Input
                  id="g-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g-email">Email (optional)</Label>
                <Input
                  id="g-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="So the host can thank you"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g-amount">Amount (USD)</Label>
                <Input
                  id="g-amount"
                  type="number"
                  min="1"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="50"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g-message">Note (optional)</Label>
                <Textarea
                  id="g-message"
                  rows={2}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Congrats! Use it well."
                />
              </div>
              <Button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                {submitting && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                <Heart className="w-3.5 h-3.5 mr-1.5" />
                Pledge
              </Button>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Tracked, not charged. The host will follow up on how to send
                the actual gift.
              </p>
            </form>
          </div>

          <div>
            <p className="font-label text-accent mb-4">
              Recent contributions
            </p>
            {wish.contributors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Be the first to pledge.
              </p>
            ) : (
              <ul className="space-y-3">
                {wish.contributors.slice(0, 12).map((c, i) => (
                  <li
                    key={i}
                    className="rounded-sm border border-border bg-card p-3"
                  >
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-sm tnum text-accent font-medium">
                        ${Math.round(c.amount_cents / 100).toLocaleString()}
                      </p>
                    </div>
                    {c.message && (
                      <p className="text-xs text-muted-foreground italic leading-relaxed">
                        "{c.message}"
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
