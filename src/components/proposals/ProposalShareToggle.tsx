import { useState } from "react";
import { Share2, Copy, Check, Loader2, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

// Vendor-side: turn on/off a public sharable URL for a proposal. The
// recipient (their host's parents, partner, decision-maker, etc.)
// can view without signing in. Read-only — accepting still requires
// the host's authenticated session.

export function ProposalShareToggle({
  proposalId,
  initialToken,
}: {
  proposalId: string;
  initialToken: string | null;
}) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const url =
    token != null
      ? typeof window !== "undefined"
        ? `${window.location.origin}/p/${token}`
        : `/p/${token}`
      : null;

  async function setEnabled(enabled: boolean) {
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc(
      "toggle_proposal_share",
      { p_proposal_id: proposalId, p_enabled: enabled },
    );
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setToken((data as string | null) ?? null);
    toast.success(enabled ? "Public link enabled" : "Public link disabled");
  }

  function copyLink() {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Copied");
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="rounded-sm border border-border bg-secondary/30 p-3 mt-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium inline-flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5" />
            Public link
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            When on, anyone with the link can view this proposal in
            read-only mode — no account needed. Accept/Decline still
            requires the host's session.
          </p>
        </div>
        <div className="flex items-center gap-2 pt-0.5">
          {busy && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          <Switch
            checked={token != null}
            onCheckedChange={setEnabled}
            disabled={busy}
          />
        </div>
      </div>

      {url && (
        <div className="flex gap-2 mt-3">
          <code className="flex-1 text-xs bg-background border border-border rounded-sm px-2.5 py-2 truncate font-mono">
            <LinkIcon className="w-3 h-3 inline-block mr-1.5 text-muted-foreground" />
            {url}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={copyLink}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
