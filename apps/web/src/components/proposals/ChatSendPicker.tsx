// Chat composer "+" attach menu for the vendor inquiry thread.
//
// One button opens a menu of two send types — Proposal and Contract.
// (Invoice and Pay link were removed in Oct 2026, owner's call: vendors
// and hosts arrange payment directly.)
// Each opens a picker of the vendor's saved items (from the Files tab)
// and, on pick, drops a formatted text message into the thread via the
// parent's sendBody(). No new direct_messages columns:
// mirrors the "Pin location" pattern (emoji-prefixed body the chat
// renderer linkifies), so this is purely additive and breaks nothing.

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Loader2,
  FileText,
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

type SendKind = "proposal" | "contract";

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

// `label` goes into the message sent to the host, so it stays as is.
// What the vendor reads (menu label, dialog title) is
// picker.kinds.<kind> in the proposals namespace.
const KIND_META: Record<SendKind, { label: string; icon: typeof FileText }> = {
  proposal: { label: "Proposal", icon: FileText },
  contract: { label: "Contract", icon: FileSignature },
};

export function ChatSendPicker({
  vendorId,
  inquiryId,
  onSend,
}: {
  vendorId: string;
  // Inquiry this chat belongs to — used to pre-fill and link the
  // proposals and contracts sent from here.
  inquiryId: string;
  // Drops a formatted body into the thread (parent's sendBody).
  onSend: (body: string) => Promise<void> | void;
}) {
  const { t } = useTranslation("proposals");
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
        {
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
            ((data ?? []) as any[]).map((tpl) => ({
              id: tpl.id,
              primary: tpl.name,
              secondary: (tpl.body as string)?.trim().split("\n")[0] || t("picker.rows.empty"),
              body: `${emoji} ${KIND_META[k].label}: ${tpl.name}\n\n${tpl.body}`,
              ...(k === "contract"
                ? { contract: { name: tpl.name, body: tpl.body, templateId: tpl.id } }
                : { proposal: { name: tpl.name, body: tpl.body, templateId: tpl.id } }),
            })),
          );
        }
      } finally {
        setLoading(false);
      }
    },
    // t: rows carry translated labels, so refetch on a language switch.
    [vendorId, t],
  );

  useEffect(() => {
    if (kind) void fetchRows(kind);
  }, [kind, fetchRows]);

  async function pick(row: PickRow) {
    setSendingId(row.id);
    try {
      // Contracts/proposals create an instance and send a link (review &
      // sign / view & accept).
      if (
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
        toast.success(t(`picker.toast.sent.${kind ?? "item"}`));
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
        toast.error(t("picker.toast.contractFailed"), { description: error?.message });
        return;
      }
      const token = (data as { sign_token: string }).sign_token;
      await onSend(
        `📑 Contract: ${editing.name} — [Review & sign](${ORIGIN}/sign/${token})`,
      );
      toast.success(t("picker.toast.contractSent"));
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
        toast.error(t("picker.toast.proposalFailed"), { description: error?.message });
        return;
      }
      const token = (data as { view_token: string }).view_token;
      await onSend(
        `📄 Proposal: ${editing.name} — [View proposal](${ORIGIN}/proposal/${token})`,
      );
      toast.success(t("picker.toast.proposalSent"));
      setEditing(null);
      setKind(null);
    } finally {
      setSendingDoc(false);
    }
  }

  return (
    <>
      {/* Only the "+" logo opens the menu — the "Send" text is a plain
          label and intentionally not part of the trigger's hit target. */}
      <div className="inline-flex items-center gap-1.5 text-xs font-bold bg-card border border-border rounded-full pl-1.5 pr-3 py-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("picker.trigger")}
              className="inline-flex items-center justify-center rounded-full p-0.5 hover:bg-foreground/10 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            {(Object.keys(KIND_META) as SendKind[]).map((k) => {
              const Icon = KIND_META[k].icon;
              return (
                <DropdownMenuItem key={k} onClick={() => setKind(k)}>
                  <Icon className="w-3.5 h-3.5 mr-2 text-foreground" />
                  {t(`picker.kinds.${k}.label`)}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="select-none text-foreground">{t("picker.send")}</span>
      </div>

      <Dialog
        open={kind !== null}
        onOpenChange={(o) => {
          if (!o) {
            setKind(null);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? editing.mode === "contract"
                  ? t("picker.editor.contractTitle")
                  : t("picker.editor.proposalTitle")
                : kind
                  ? t(`picker.kinds.${kind}.title`)
                  : ""}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {editing
                ? editing.mode === "contract"
                  ? t("picker.editor.contractHint")
                  : t("picker.editor.proposalHint")
                : kind === "contract"
                    ? t("picker.hints.contract")
                    : t("picker.hints.proposal")}
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
                className="w-full text-[13px] leading-relaxed rounded-md border border-border bg-background px-3 py-2 resize-y"
              />
              {/\[[^\]]+\]/.test(editing.body) ? (
                <p className="text-[11px] text-accent">
                  {editing.mode === "contract"
                    ? t("picker.editor.unfilledContract")
                    : t("picker.editor.unfilledProposal")}
                </p>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="text-sm text-muted-foreground hover:text-accent px-2 py-1.5"
                >
                  {t("picker.editor.back")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    editing.mode === "contract"
                      ? void sendContract()
                      : void sendProposal()
                  }
                  disabled={sendingDoc}
                  className="inline-flex justify-center items-center gap-1.5 text-sm font-bold rounded-full bg-gold text-ink px-4 disabled:bg-gold-muted h-9 hover:bg-gold-hover"
                >
                  {sendingDoc ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : editing.mode === "contract" ? (
                    <FileSignature className="w-3.5 h-3.5" />
                  ) : (
                    <FileText className="w-3.5 h-3.5" />
                  )}
                  {editing.mode === "contract"
                    ? t("picker.editor.sendContract")
                    : t("picker.editor.sendProposal")}
                </button>
              </div>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {kind === "contract"
                    ? t("picker.empty.contract")
                    : t("picker.empty.proposal")}
            </p>
          ) : (
            <div className="divide-y divide-border -mx-2">
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
