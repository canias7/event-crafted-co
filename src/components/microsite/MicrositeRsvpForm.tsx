import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// RSVP form rendered inside the public event microsite. Submits via a
// SECURITY DEFINER RPC that validates the token and rate-limits by
// email upsert (one response per email, edits replace).

interface RsvpQuestion {
  id: string;
  label: string;
  type?: "text" | "select";
  options?: string[];
  required?: boolean;
}

interface RsvpConfig {
  deadline: string | null;
  intro: string | null;
  questions: RsvpQuestion[];
  show: boolean;
}

interface ThemeVars {
  bg: string;
  surface: string;
  accent: string;
  muted: string;
  ink: string;
}

export function MicrositeRsvpForm({
  token,
  hostName,
  theme,
}: {
  token: string;
  hostName: string;
  theme: ThemeVars;
}) {
  const [config, setConfig] = useState<RsvpConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [attending, setAttending] = useState<boolean | null>(null);
  const [plusOnes, setPlusOnes] = useState("0");
  const [message, setMessage] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).rpc(
        "get_microsite_rsvp_config",
        { p_token: token },
      );
      if (cancelled) return;
      setConfig((data as RsvpConfig | null) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (attending === null) {
      setError("Please choose Yes or No");
      return;
    }
    setError(null);
    setSubmitting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcError } = await (supabase as any).rpc(
      "submit_microsite_rsvp",
      {
        p_token: token,
        p_name: name,
        p_email: email,
        p_attending: attending,
        p_plus_ones: Number.parseInt(plusOnes, 10) || 0,
        p_message: message || null,
        p_answers: answers,
      },
    );
    setSubmitting(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setDone(true);
  }

  if (loading || !config?.show) return null;

  const closed =
    config.deadline != null && new Date(config.deadline).getTime() < Date.now();

  if (done) {
    return (
      <div
        className="text-center max-w-md mx-auto rounded-sm p-8"
        style={{
          background: `hsl(${theme.surface})`,
          color: `hsl(${theme.ink})`,
        }}
      >
        <CheckCircle2
          className="w-10 h-10 mx-auto mb-4"
          style={{ color: `hsl(${theme.accent})` }}
        />
        <p className="font-display text-2xl mb-2">Thank you</p>
        <p className="text-sm leading-relaxed opacity-75">
          Your RSVP has been recorded. {hostName.split(" ")[0]} can see it
          now. You can come back to this page anytime to update your
          response.
        </p>
      </div>
    );
  }

  if (closed) {
    return (
      <div className="text-center max-w-md mx-auto">
        <p
          className="text-base leading-relaxed"
          style={{ color: `hsl(${theme.ink} / 0.75)` }}
        >
          The RSVP window has closed. Please reach out to{" "}
          {hostName.split(" ")[0]} directly.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="max-w-md mx-auto space-y-4 rounded-sm p-6"
      style={{
        background: `hsl(${theme.surface})`,
        color: `hsl(${theme.ink})`,
      }}
    >
      {config.intro && (
        <p
          className="text-sm leading-relaxed mb-2"
          style={{ color: `hsl(${theme.ink} / 0.75)` }}
        >
          {config.intro}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="r-name">Your name</Label>
        <Input
          id="r-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="name"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="r-email">Email</Label>
        <Input
          id="r-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Will you be there?</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setAttending(true)}
            className="rounded-full px-4 py-2.5 text-sm font-medium transition-colors border"
            style={{
              borderColor:
                attending === true
                  ? `hsl(${theme.accent})`
                  : `hsl(${theme.muted})`,
              background:
                attending === true
                  ? `hsl(${theme.accent})`
                  : `hsl(${theme.bg})`,
              color:
                attending === true
                  ? `hsl(${theme.bg})`
                  : `hsl(${theme.ink})`,
            }}
          >
            Yes, I'll be there
          </button>
          <button
            type="button"
            onClick={() => setAttending(false)}
            className="rounded-full px-4 py-2.5 text-sm font-medium transition-colors border"
            style={{
              borderColor:
                attending === false
                  ? `hsl(${theme.ink} / 0.5)`
                  : `hsl(${theme.muted})`,
              background:
                attending === false
                  ? `hsl(${theme.ink} / 0.08)`
                  : `hsl(${theme.bg})`,
              color: `hsl(${theme.ink})`,
            }}
          >
            Sorry, can't make it
          </button>
        </div>
      </div>

      {attending === true && (
        <div className="space-y-1.5">
          <Label htmlFor="r-plus">Bringing anyone?</Label>
          <Input
            id="r-plus"
            type="number"
            min={0}
            max={20}
            value={plusOnes}
            onChange={(e) => setPlusOnes(e.target.value)}
          />
          <p className="text-xs opacity-60">
            Number of additional guests joining you (besides yourself).
          </p>
        </div>
      )}

      {config.questions.map((q) => (
        <div key={q.id} className="space-y-1.5">
          <Label htmlFor={`r-q-${q.id}`}>
            {q.label}
            {q.required && <span className="opacity-70"> *</span>}
          </Label>
          {q.type === "select" && q.options ? (
            <select
              id={`r-q-${q.id}`}
              required={q.required}
              value={answers[q.id] ?? ""}
              onChange={(e) =>
                setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
              }
              className="w-full h-10 px-3 rounded-sm border bg-transparent text-sm"
              style={{
                borderColor: `hsl(${theme.muted})`,
                color: `hsl(${theme.ink})`,
              }}
            >
              <option value="">Select…</option>
              {q.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <Input
              id={`r-q-${q.id}`}
              required={q.required}
              value={answers[q.id] ?? ""}
              onChange={(e) =>
                setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
              }
            />
          )}
        </div>
      ))}

      <div className="space-y-1.5">
        <Label htmlFor="r-message">Note for {hostName.split(" ")[0]}</Label>
        <Textarea
          id="r-message"
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Optional"
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs rounded-sm p-2.5" style={{ background: `hsl(${theme.ink} / 0.06)` }}>
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}

      <Button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full"
        style={{
          background: `hsl(${theme.accent})`,
          color: `hsl(${theme.bg})`,
        }}
      >
        {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Send RSVP
      </Button>
    </form>
  );
}
