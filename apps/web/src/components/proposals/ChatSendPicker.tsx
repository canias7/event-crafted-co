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
}

const ORIGIN = typeof window !== "undefined" ? window.location.origin : "https://eventvendora.com";

function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
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
  onSendInvoice,
}: {
  vendorId: string;
  // Inquiry this chat belongs to — stamped onto a pay link when sent so a
  // successful payment can auto-confirm the booking (webhook).
  inquiryId: string;
  // Drops a formatted body into the thread (parent's sendBody).
  onSend: (body: string) => Promise<void> | void;
  // Sends an invoice as an actual PDF attachment (parent builds + uploads
  // the PDF, then posts a message with it). Falls back to onSend if absent.
  onSendInvoice?: (invoiceId: string, body: string) => Promise<void> | void;
}) {
  const [kind, setKind] = useState<SendKind | null>(null);
  const [rows, setRows] = useState<PickRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

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
              body: `🧾 Invoice ${inv.invoice_number} — ${formatMoney(inv.total_cents, inv.currency)}\n${ORIGIN}/pay/invoice/${inv.slug}`,
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
              body: `💳 ${l.title || "Payment"} — ${formatMoney(l.amount_cents, l.currency)}\n${ORIGIN}/pay/link/${l.slug}`,
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
      // Invoices go out as an actual PDF attachment when the parent
      // supports it; everything else drops a formatted text/link body.
      if (kind === "invoice" && onSendInvoice) {
        await onSendInvoice(row.id, row.body);
      } else {
        await onSend(row.body);
      }
      toast.success(`${kind ? KIND_META[kind].label : "Item"} sent`);
      setKind(null);
    } finally {
      setSendingId(null);
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

      <Dialog open={kind !== null} onOpenChange={(o) => !o && setKind(null)}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto rounded-sm">
          <DialogHeader>
            <DialogTitle>{kind ? KIND_META[kind].title : ""}</DialogTitle>
            <DialogDescription className="text-xs">
              {kind === "invoice"
                ? "Pick one to send as a PDF (with its pay link) into the chat."
                : kind === "link"
                  ? "Pick one to drop its payment link into the chat."
                  : "Pick a saved template to send into the chat. Create them in Files."}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
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
