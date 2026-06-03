// Chat composer "+" attach menu for the vendor inquiry thread.
//
// One button opens a menu of four send types — Invoice, Pay link,
// Proposal, Contract. Each opens a picker of the vendor's saved items
// (from the Files tab) and, on pick, drops a formatted text message into
// the thread via the parent's sendBody(). No new direct_messages columns:
// mirrors the "Pin location" pattern (emoji-prefixed body the chat
// renderer linkifies), so this is purely additive and breaks nothing.

import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Loader2,
  FileText,
  Link2,
  ReceiptText,
  FileSignature,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type SendKind = "invoice" | "link" | "proposal" | "contract";

interface PickRow {
  id: string;
  // Display
  primary: string;
  secondary?: string | null;
  // Outgoing message body
  body: string;
  // For contracts/proposals: the template content used to create an
  // instance (a /sign/<token> or /proposal/<token> link is sent instead
  // of the raw text).
  contract?: { name: string; body: string; templateId: string };
  proposal?: { name: string; body: string; templateId: string };
}

const ORIGIN = typeof window !== "undefined" ? window.location.origin : "https://eventvendora.com";

function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Prepare a template body for signing: strip the redundant leading "#
// title" line (the page shows the title separately), drop the in-body
// "Signature: ____" placeholder lines (the e-sign block replaces them),
// and fill the merge fields we know from the inquiry. [Total Amount] and
// any other brackets are left for the vendor to fill in the editor.
function prefillContractBody(
  body: string,
  ctx: { hostName?: string; eventDate?: string; location?: string },
): string {
  let b = body.replace(/^#\s+.*\n+/, "");
  b = b
    .split("\n")
    .filter((line) => !/signature\s*:\s*_/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (ctx.hostName) b = b.replace(/\[Client Name\]/g, ctx.hostName);
  if (ctx.eventDate) b = b.replace(/\[Event Date\]/g, ctx.eventDate);
  if (ctx.location) b = b.replace(/\[Venue ?\/? ?Location\]/g, ctx.location);
  return b;
}

// Prepare a proposal body: fill the merge fields we know from the inquiry,
// leaving [Total Amount] for the vendor to fill in the editor. Proposals keep
// their plain structure (no "# title" / signature lines to strip).
function prefillProposalBody(
  body: string,
  ctx: { hostName?: string; eventDate?: string; location?: string },
): string {
  // Drop the trailing "Ready to move forward? Reply to this proposal…" CTA —
  // the proposal page provides its own Accept action, so the reply-to
  // instruction is stale and would duplicate the page's heading.
  let b = body
    .split("\n")
    .filter((line) => !/reply to this proposal/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (ctx.hostName) b = b.replace(/\[Client Name\]/g, ctx.hostName);
  if (ctx.eventDate) b = b.replace(/\[Event Date\]/g, ctx.eventDate);
  if (ctx.location) b = b.replace(/\[Venue ?\/? ?Location\]/g, ctx.location);
  return b;
}

const KIND_META: Record<SendKind, { label: string; icon: typeof FileText; title: string }> = {
  invoice: { label: "Invoice", icon: ReceiptText, title: "Send an invoice" },
  link: { label: "Pay link", icon: Link2, title: "Send a pay link" },
  proposal: { label: "Proposal", icon: FileText, title: "Send a proposal" },
  contract: { label: "Contract", icon: FileSignature, title: "Send a contract" },
};

export function ChatSendPicker({
  vendorId,
  inquiryId,
  onSend,
  onStageInvoice,
}: {
  vendorId: string;
  // Inquiry this chat belongs to — stamped onto a pay link when sent so a
  // successful payment can auto-confirm the booking (webhook).
  inquiryId: string;
  // Drops a formatted body into the thread (parent's sendBody).
  onSend: (body: string) => Promise<void> | void;
  // Stages an invoice into the composer as a PDF attachment + body (the
  // vendor reviews, then sends). Falls back to onSend if absent.
  onStageInvoice?: (invoiceId: string, body: string) => Promise<void> | void;
}) {
  const [kind, setKind] = useState<SendKind | null>(null);
  const [rows, setRows] = useState<PickRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  // Fill step: after picking a contract or proposal we open an editor with
  // the merge fields pre-filled, so the vendor completes [Total Amount] etc.
  // before it goes out (for signature / for the client to accept).
  const [editing, setEditing] = useState<
    {
      mode: "contract" | "proposal";
      name: string;
      body: string;
      templateId: string;
      recipientName: string;
    } | null
  >(null);
  const [sendingDoc, setSendingDoc] = useState(false);

  const fetchRows = useCallback(
    async (k: SendKind) => {
      setLoading(true);
      setRows([]);
      try {
        if (k === "invoice") {
          const { data } = await supabase
            .from("invoices")
            .select("id, invoice_number, slug, total_cents, currency, status, bill_to_name")
            .eq("vendor_id", vendorId)
            .in("status", ["draft", "sent", "overdue"])
            .order("created_at", { ascending: false })
            .limit(50);
          setRows(
            ((data ?? []) as any[]).map((inv) => ({
              id: inv.id,
              primary: `Invoice ${inv.invoice_number}`,
              secondary: `${formatMoney(inv.total_cents, inv.currency)}${inv.bill_to_name ? ` · ${inv.bill_to_name}` : ""}`,
              body: `🧾 Invoice ${inv.invoice_number} · ${formatMoney(inv.total_cents, inv.currency)} — [Pay online](${ORIGIN}/pay/invoice/${inv.slug})`,
            })),
          );
        } else if (k === "link") {
          const { data } = await supabase
            .from("payment_links")
            .select("id, slug, title, amount_cents, currency, status")
            .eq("vendor_id", vendorId)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(50);
          setRows(
            ((data ?? []) as any[]).map((l) => ({
              id: l.id,
              primary: l.title || "Pay link",
              secondary: formatMoney(l.amount_cents, l.currency),
              body: `💳 ${l.title || "Payment"} · ${formatMoney(l.amount_cents, l.currency)} — [Pay online](${ORIGIN}/pay/link/${l.slug})`,
            })),
          );
        } else {
          // proposal | contract — saved Files templates (text documents)
          const table = k === "contract" ? "vendor_contract_templates" : "vendor_proposal_templates";
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (supabase as any)
            .from(table)
            .select("id, name, body, is_default")
            .eq("vendor_id", vendorId)
            .order("is_default", { ascending: false })
            .order("name", { ascending: true })
            .limit(50);
          const emoji = k === "contract" ? "📑" : "📄";
          setRows(
            ((data ?? []) as any[]).map((t) => ({
              id: t.id,
              primary: t.name,
              secondary: (t.body as string)?.trim().split("\n")[0] || "Empty",
              body: `${emoji} ${KIND_META[k].label}: ${t.name}\n\n${t.body}`,
              ...(k === "contract"
                ? { contract: { name: t.name, body: t.body, templateId: t.id } }
                : { proposal: { name: t.name, body: t.body, templateId: t.id } }),
            })),
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [vendorId],
  );

  useEffect(() => {
    if (kind) void fetchRows(kind);
  }, [kind, fetchRows]);

  async function pick(row: PickRow) {
    setSendingId(row.id);
    try {
      // Link a sent pay link to this inquiry so a successful payment can
      // auto-confirm the booking (vendorapay-webhook reads inquiry_id).
      // Best-effort: a failed stamp must not block sending the link.
      if (kind === "link" && inquiryId) {
        const { error } = await supabase
          .from("payment_links")
          .update({ inquiry_id: inquiryId })
          .eq("id", row.id);
        if (error) console.error("[ChatSendPicker] link inquiry stamp failed", error);
      }
      // Invoices stage a PDF + body into the composer (vendor reviews,
      // then sends). Contracts/proposals create an instance and send a
      // link (review & sign / view & accept). Everything else drops a
      // text/link body.
      if (kind === "invoice" && onStageInvoice) {
        await onStageInvoice(row.id, row.body);
        toast.success("Invoice added — review and send");
      } else if (
        (kind === "contract" && row.contract) ||
        (kind === "proposal" && row.proposal)
      ) {
        // Pre-fill the merge fields from the inquiry, then open the editor
        // so the vendor completes anything left (e.g. [Total Amount]).
        const doc = kind === "contract" ? row.contract! : row.proposal!;
        let hostName = "";
        let eventDate = "";
        let location = "";
        if (inquiryId) {
          const { data: inq } = await supabase
            .from("inquiries")
            .select(
              "event_date, location, host:profiles!inquiries_host_id_fkey(display_name)",
            )
            .eq("id", inquiryId)
            .maybeSingle();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const i = inq as any;
          hostName = i?.host?.display_name ?? "";
          eventDate = formatDate(i?.event_date ?? null);
          location = i?.location ?? "";
        }
        const fill = kind === "contract" ? prefillContractBody : prefillProposalBody;
        setEditing({
          mode: kind,
          name: doc.name,
          body: fill(doc.body, { hostName, eventDate, location }),
          templateId: doc.templateId,
          recipientName: hostName,
        });
        return; // editor's send button creates + sends it
      } else {
        await onSend(row.body);
        toast.success(`${kind ? KIND_META[kind].label : "Item"} sent`);
      }
      setKind(null);
    } finally {
      setSendingId(null);
    }
  }

  async function sendContract() {
    if (!editing || sendingDoc) return;
    setSendingDoc(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vendor_contracts")
        .insert({
          vendor_id: vendorId,
          inquiry_id: inquiryId,
          template_id: editing.templateId,
          title: editing.name,
          body: editing.body,
          recipient_name: editing.recipientName || null,
        })
        .select("sign_token")
        .single();
      if (error || !(data as { sign_token?: string })?.sign_token) {
        toast.error("Couldn't create the contract", { description: error?.message });
        return;
      }
      const token = (data as { sign_token: string }).sign_token;
      await onSend(
        `📑 Contract: ${editing.name} — [Review & sign](${ORIGIN}/sign/${token})`,
      );
      toast.success("Contract sent for signing");
      setEditing(null);
      setKind(null);
    } finally {
      setSendingDoc(false);
    }
  }

  async function sendProposal() {
    if (!editing || sendingDoc) return;
    setSendingDoc(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vendor_proposals")
        .insert({
          vendor_id: vendorId,
          inquiry_id: inquiryId,
          template_id: editing.templateId,
          title: editing.name,
          body: editing.body,
          recipient_name: editing.recipientName || null,
        })
        .select("view_token")
        .single();
      if (error || !(data as { view_token?: string })?.view_token) {
        toast.error("Couldn't create the proposal", { description: error?.message });
        return;
      }
      const token = (data as { view_token: string }).view_token;
      await onSend(
        `📄 Proposal: ${editing.name} — [View proposal](${ORIGIN}/proposal/${token})`,
      );
      toast.success("Proposal sent");
      setEditing(null);
      setKind(null);
    } finally {
      setSendingDoc(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs font-medium bg-background/95 border border-border/40 shadow-sm rounded-full px-3 py-1.5 hover:bg-background"
          >
            <Plus className="w-3.5 h-3.5 text-foreground/70" />
            Send
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          {(Object.keys(KIND_META) as SendKind[]).map((k) => {
            const Icon = KIND_META[k].icon;
            return (
              <DropdownMenuItem key={k} onClick={() => setKind(k)}>
                <Icon className="w-3.5 h-3.5 mr-2 text-foreground/70" />
                {KIND_META[k].label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={kind !== null}
        onOpenChange={(o) => {
          if (!o) {
            setKind(null);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto rounded-sm">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? editing.mode === "contract"
                  ? "Review & fill the contract"
                  : "Review & fill the proposal"
                : kind
                  ? KIND_META[kind].title
                  : ""}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {editing
                ? editing.mode === "contract"
                  ? "Complete any [brackets] (e.g. [Total Amount]), then send it for e-signature."
                  : "Complete any [brackets] (e.g. [Total Amount]), then send it for the client to review and accept."
                : kind === "invoice"
                ? "Pick one to add as a PDF (with its pay link) to your message — then review and send."
                : kind === "link"
                  ? "Pick one to drop its payment link into the chat."
                  : kind === "contract"
                    ? "Pick a contract to send for e-signature — the host gets a link to review and sign."
                    : "Pick a saved template to send into the chat. Create them in Files."}
            </DialogDescription>
          </DialogHeader>

          {editing ? (
            <div className="space-y-3">
              <textarea
                value={editing.body}
                onChange={(e) =>
                  setEditing((ed) => (ed ? { ...ed, body: e.target.value } : ed))
                }
                rows={12}
                className="w-full text-[13px] leading-relaxed rounded-md border border-input bg-background px-3 py-2 resize-y"
              />
              {/\[[^\]]+\]/.test(editing.body) ? (
                <p className="text-[11px] text-amber-700">
                  Heads up — there are still unfilled [placeholders] in the{" "}
                  {editing.mode}.
                </p>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="text-sm text-muted-foreground hover:text-foreground px-2 py-1.5"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() =>
                    editing.mode === "contract"
                      ? void sendContract()
                      : void sendProposal()
                  }
                  disabled={sendingDoc}
                  className="inline-flex items-center gap-1.5 text-sm font-medium rounded-full bg-foreground text-background px-4 py-2 disabled:opacity-60"
                >
                  {sendingDoc ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : editing.mode === "contract" ? (
                    <FileSignature className="w-3.5 h-3.5" />
                  ) : (
                    <FileText className="w-3.5 h-3.5" />
                  )}
                  {editing.mode === "contract" ? "Send for signature" : "Send proposal"}
                </button>
              </div>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {kind === "invoice"
                ? "No unpaid invoices. Create one in Files → Invoices."
                : kind === "link"
                  ? "No active pay links. Create one in Files → Pay Links."
                  : `No saved ${kind === "contract" ? "contracts" : "proposals"}. Create one in Files → ${kind === "contract" ? "Contracts" : "Proposals"}.`}
            </p>
          ) : (
            <div className="divide-y divide-border/50 -mx-2">
              {rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => void pick(row)}
                  disabled={sendingId !== null}
                  className="w-full text-left px-2 py-2.5 hover:bg-foreground/[0.04] rounded transition-colors flex items-center gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{row.primary}</p>
                    {row.secondary ? (
                      <p className="text-xs text-muted-foreground truncate">{row.secondary}</p>
                    ) : null}
                  </div>
                  {sendingId === row.id ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
