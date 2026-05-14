import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, Plus, Send, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

// Email leads — a contact list for outreach campaigns. Manual add
// today; scraping + bulk sending + reply tracking are follow-up
// phases that read/write the same email_leads rows.

type LeadStatus = "new" | "contacted" | "replied" | "converted" | "archived";

type EmailLead = {
  id: string;
  email: string;
  name: string | null;
  source: string | null;
  status: LeadStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  last_sent_at: string | null;
  last_template_id: string | null;
};

type EmailTemplate = {
  id: string;
  name: string;
};

type PreviewState = {
  lead: EmailLead;
  templateId: string;
  subject: string;
  body: string;
  fromName: string | null;
  fromAddress: string | null;
};

const STATUS_OPTIONS: ReadonlyArray<{ value: LeadStatus; label: string }> = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "replied", label: "Replied" },
  { value: "converted", label: "Converted" },
  { value: "archived", label: "Archived" },
];

const STATUS_TINT: Record<LeadStatus, string> = {
  new: "bg-blue-50 text-blue-700 border-blue-200",
  contacted: "bg-amber-50 text-amber-700 border-amber-200",
  replied: "bg-purple-50 text-purple-700 border-purple-200",
  converted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  archived: "bg-gray-100 text-gray-600 border-gray-200",
};

export function EmailLeadsPage() {
  const [rows, setRows] = useState<EmailLead[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  // Per-row selected template id, keyed by lead id. Defaults to the
  // lead's last_template_id (if any) so re-sending the same template
  // is one click.
  const [pickedTemplate, setPickedTemplate] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LeadStatus | "all">("all");
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: leads, error: leadsErr }, { data: tpls, error: tplsErr }] =
      await Promise.all([
        supabase
          .from("email_leads")
          .select(
            "id, email, name, source, status, notes, created_at, updated_at, last_sent_at, last_template_id",
          )
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("email_templates")
          .select("id, name")
          .order("created_at", { ascending: false }),
      ]);
    setLoading(false);
    if (leadsErr) {
      toast.error(leadsErr.message);
      return;
    }
    if (tplsErr) {
      // Non-fatal: leads still render without template options.
      console.warn("templates load failed:", tplsErr.message);
    }
    const leadRows = (leads ?? []) as EmailLead[];
    setRows(leadRows);
    setTemplates((tpls ?? []) as EmailTemplate[]);
    setPickedTemplate(
      Object.fromEntries(
        leadRows
          .filter((l) => l.last_template_id)
          .map((l) => [l.id, l.last_template_id as string]),
      ),
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  const counts = useMemo(() => {
    const map: Record<LeadStatus | "all", number> = {
      all: rows.length,
      new: 0,
      contacted: 0,
      replied: 0,
      converted: 0,
      archived: 0,
    };
    for (const r of rows) map[r.status]++;
    return map;
  }, [rows]);

  async function updateStatus(id: string, next: LeadStatus) {
    const { error } = await supabase
      .from("email_leads")
      .update({ status: next })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((p) => p.map((r) => (r.id === id ? { ...r, status: next } : r)));
  }

  async function updateNotes(id: string, notes: string) {
    const { error } = await supabase
      .from("email_leads")
      .update({ notes: notes.trim() || null })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((p) =>
      p.map((r) => (r.id === id ? { ...r, notes: notes.trim() || null } : r)),
    );
  }

  async function openPreview(lead: EmailLead) {
    const templateId = pickedTemplate[lead.id];
    if (!templateId) {
      toast.error("Pick a template first");
      return;
    }
    setSending((p) => ({ ...p, [lead.id]: true }));
    const { data, error } = await supabase.functions.invoke(
      "send-transactional-email",
      {
        body: {
          kind: "outreach_lead_preview",
          lead_id: lead.id,
          template_id: templateId,
        },
      },
    );
    setSending((p) => ({ ...p, [lead.id]: false }));
    if (error || data?.error) {
      toast.error(error?.message ?? data?.error ?? "Preview failed");
      return;
    }
    setPreview({
      lead,
      templateId,
      subject: data.subject ?? "",
      body: data.body ?? "",
      fromName: data.from_name ?? null,
      fromAddress: data.from_address ?? null,
    });
  }

  async function confirmSend(finalSubject: string, finalBody: string) {
    if (!preview) return;
    setSending((p) => ({ ...p, [preview.lead.id]: true }));
    const { data, error } = await supabase.functions.invoke(
      "send-transactional-email",
      {
        body: {
          kind: "outreach_lead",
          lead_id: preview.lead.id,
          template_id: preview.templateId,
          subject_override: finalSubject,
          body_override: finalBody,
        },
      },
    );
    setSending((p) => ({ ...p, [preview.lead.id]: false }));
    if (error || data?.ok === false) {
      toast.error(error?.message ?? data?.error ?? "Send failed");
      return;
    }
    toast.success(`Sent to ${preview.lead.email}`);
    const now = new Date().toISOString();
    setRows((p) =>
      p.map((r) =>
        r.id === preview.lead.id
          ? {
              ...r,
              status: "contacted" as LeadStatus,
              last_sent_at: now,
              last_template_id: preview.templateId,
            }
          : r,
      ),
    );
    setPreview(null);
  }

  async function deleteLead(id: string) {
    if (!confirm("Delete this lead?")) return;
    const { error } = await supabase.from("email_leads").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((p) => p.filter((r) => r.id !== id));
    toast.success("Lead deleted");
  }

  async function addLead(form: {
    email: string;
    name: string;
    source: string;
    notes: string;
  }) {
    const email = form.email.trim();
    if (!email) {
      toast.error("Email is required");
      return false;
    }
    const { data, error } = await supabase
      .from("email_leads")
      .insert({
        email,
        name: form.name.trim() || null,
        source: form.source.trim() || null,
        notes: form.notes.trim() || null,
      })
      .select("id, email, name, source, status, notes, created_at, updated_at")
      .single();
    if (error) {
      toast.error(error.message);
      return false;
    }
    setRows((p) => [data as EmailLead, ...p]);
    toast.success("Lead added");
    return true;
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/workspace"
          className="flex items-center gap-1 rounded p-1 text-sm text-ink/60 hover:bg-ink/5"
        >
          <ChevronLeft className="h-4 w-4" />
          Workspace
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Email leads</h1>
          <p className="mt-1 text-sm text-ink/60">
            Track contacts and outreach. {rows.length} total.
          </p>
        </div>
        <button
          onClick={() => setShowAdd((s) => !s)}
          className="flex items-center gap-2 rounded bg-ink px-4 py-2 text-sm font-medium text-bone hover:bg-ink/90"
        >
          <Plus className="h-4 w-4" />
          {showAdd ? "Cancel" : "Add lead"}
        </button>
      </div>

      {showAdd ? (
        <AddLeadForm
          onSubmit={async (form) => {
            const ok = await addLead(form);
            if (ok) setShowAdd(false);
          }}
        />
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <FilterPill
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label="All"
          count={counts.all}
        />
        {STATUS_OPTIONS.map((s) => (
          <FilterPill
            key={s.value}
            active={filter === s.value}
            onClick={() => setFilter(s.value)}
            label={s.label}
            count={counts[s.value]}
          />
        ))}
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-ink/60">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="mt-10 text-sm text-ink/60">
          {filter === "all"
            ? "No leads yet. Add one to get started."
            : `No leads with status “${filter}”.`}
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-ink/10 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-ink/10 bg-ink/[0.02] text-xs uppercase tracking-wide text-ink/60">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Source</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Notes</th>
                <th className="px-4 py-3 text-left font-medium">Added</th>
                <th className="px-4 py-3 text-left font-medium">Send</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <LeadRow
                  key={r.id}
                  lead={r}
                  templates={templates}
                  templateId={pickedTemplate[r.id] ?? ""}
                  onTemplateChange={(id) =>
                    setPickedTemplate((p) => ({ ...p, [r.id]: id }))
                  }
                  sending={!!sending[r.id]}
                  onSend={() => openPreview(r)}
                  onStatus={(next) => updateStatus(r.id, next)}
                  onNotes={(next) => updateNotes(r.id, next)}
                  onDelete={() => deleteLead(r.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview ? (
        <PreviewModal
          preview={preview}
          sending={!!sending[preview.lead.id]}
          onClose={() => setPreview(null)}
          onSend={(subj, body) => confirmSend(subj, body)}
        />
      ) : null}
    </div>
  );
}

function PreviewModal({
  preview,
  sending,
  onClose,
  onSend,
}: {
  preview: PreviewState;
  sending: boolean;
  onClose: () => void;
  onSend: (subject: string, body: string) => void;
}) {
  const [subject, setSubject] = useState(preview.subject);
  const [body, setBody] = useState(preview.body);
  const fromLine =
    preview.fromAddress
      ? preview.fromName
        ? `${preview.fromName} <${preview.fromAddress}>`
        : preview.fromAddress
      : "Default (noreply@eventvendora.com)";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <div>
            <p className="text-sm font-medium">Review before sending</p>
            <p className="mt-0.5 text-xs text-ink/60">
              AI-personalized for {preview.lead.name ?? preview.lead.email}. Edit
              anything you want before it goes out.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-ink/50 hover:bg-ink/5 hover:text-ink"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="text-xs text-ink/60">
            <span className="block">
              <span className="font-medium text-ink/70">From:</span> {fromLine}
            </span>
            <span className="block">
              <span className="font-medium text-ink/70">To:</span>{" "}
              {preview.lead.email}
            </span>
          </div>
          <label className="block text-sm">
            <span className="block text-xs uppercase tracking-wide text-ink/60">
              Subject
            </span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full rounded border border-ink/15 px-3 py-2 outline-none focus:border-ink/40"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-xs uppercase tracking-wide text-ink/60">
              Body
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={16}
              className="mt-1 w-full rounded border border-ink/15 px-3 py-2 font-mono text-[13px] leading-relaxed outline-none focus:border-ink/40"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink/10 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded border border-ink/15 px-4 py-2 text-sm text-ink/70 hover:bg-ink/5"
          >
            Cancel
          </button>
          <button
            onClick={() => onSend(subject, body)}
            disabled={sending || !subject.trim() || !body.trim()}
            className="flex items-center gap-2 rounded bg-ink px-4 py-2 text-sm font-medium text-bone hover:bg-ink/90 disabled:opacity-50"
          >
            <Send className="h-3 w-3" />
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs ${
        active
          ? "border-ink bg-ink text-bone"
          : "border-ink/15 bg-white text-ink/70 hover:border-ink/30"
      }`}
    >
      {label}
      <span className="ml-1.5 opacity-70">{count}</span>
    </button>
  );
}

function AddLeadForm({
  onSubmit,
}: {
  onSubmit: (f: {
    email: string;
    name: string;
    source: string;
    notes: string;
  }) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="mt-6 rounded-lg border border-ink/10 bg-white p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSubmit({ email, name, source, notes });
        setBusy(false);
        setEmail("");
        setName("");
        setSource("");
        setNotes("");
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="block text-xs uppercase tracking-wide text-ink/60">
            Email <span className="text-red-500">*</span>
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            className="mt-1 w-full rounded border border-ink/15 px-3 py-2 outline-none focus:border-ink/40"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs uppercase tracking-wide text-ink/60">
            Name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
            className="mt-1 w-full rounded border border-ink/15 px-3 py-2 outline-none focus:border-ink/40"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs uppercase tracking-wide text-ink/60">
            Source
          </span>
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Charlotte photographers scrape"
            className="mt-1 w-full rounded border border-ink/15 px-3 py-2 outline-none focus:border-ink/40"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-ink/60">
            Notes
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anything to remember"
            className="mt-1 w-full rounded border border-ink/15 px-3 py-2 outline-none focus:border-ink/40"
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-ink px-4 py-2 text-sm font-medium text-bone hover:bg-ink/90 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Save lead"}
        </button>
      </div>
    </form>
  );
}

function LeadRow({
  lead,
  templates,
  templateId,
  onTemplateChange,
  sending,
  onSend,
  onStatus,
  onNotes,
  onDelete,
}: {
  lead: EmailLead;
  templates: EmailTemplate[];
  templateId: string;
  onTemplateChange: (id: string) => void;
  sending: boolean;
  onSend: () => void;
  onStatus: (next: LeadStatus) => void;
  onNotes: (next: string) => void;
  onDelete: () => void;
}) {
  const [notesDraft, setNotesDraft] = useState(lead.notes ?? "");
  const [editingNotes, setEditingNotes] = useState(false);
  return (
    <tr className="border-b border-ink/5 last:border-b-0">
      <td className="px-4 py-3 align-top font-medium">{lead.email}</td>
      <td className="px-4 py-3 align-top text-ink/80">
        {lead.name ?? <span className="text-ink/40">—</span>}
      </td>
      <td className="px-4 py-3 align-top text-ink/70">
        {lead.source ?? <span className="text-ink/40">—</span>}
      </td>
      <td className="px-4 py-3 align-top">
        <select
          value={lead.status}
          onChange={(e) => onStatus(e.target.value as LeadStatus)}
          className={`rounded-full border px-2.5 py-1 text-xs ${STATUS_TINT[lead.status]}`}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3 align-top">
        {editingNotes ? (
          <div>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={2}
              className="w-full rounded border border-ink/15 px-2 py-1 text-sm outline-none focus:border-ink/40"
            />
            <div className="mt-1 flex gap-2">
              <button
                onClick={() => {
                  onNotes(notesDraft);
                  setEditingNotes(false);
                }}
                className="rounded bg-ink px-2 py-0.5 text-xs text-bone hover:bg-ink/90"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setNotesDraft(lead.notes ?? "");
                  setEditingNotes(false);
                }}
                className="rounded border border-ink/15 px-2 py-0.5 text-xs text-ink/70 hover:bg-ink/5"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditingNotes(true)}
            className="max-w-[220px] truncate text-left text-ink/70 hover:text-ink"
            title={lead.notes ?? "Click to add notes"}
          >
            {lead.notes ?? <span className="text-ink/40">+ add notes</span>}
          </button>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 align-top text-ink/60">
        {new Date(lead.created_at).toLocaleDateString()}
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex items-center gap-2">
          <select
            value={templateId}
            onChange={(e) => onTemplateChange(e.target.value)}
            disabled={templates.length === 0 || sending}
            className="max-w-[160px] rounded border border-ink/15 bg-white px-2 py-1 text-xs text-ink/80 outline-none focus:border-ink/40 disabled:opacity-50"
            title={
              templates.length === 0
                ? "Create a template first in /workspace/templates"
                : "Pick a template"
            }
          >
            <option value="">
              {templates.length === 0 ? "No templates" : "Pick template…"}
            </option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            onClick={onSend}
            disabled={!templateId || sending}
            className="flex items-center gap-1 rounded bg-ink px-2.5 py-1 text-xs font-medium text-bone hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
            title={lead.last_sent_at ? `Last sent ${new Date(lead.last_sent_at).toLocaleString()}` : "Send this template"}
          >
            <Send className="h-3 w-3" />
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
        {lead.last_sent_at ? (
          <p className="mt-1 text-[10px] text-ink/40">
            Sent {new Date(lead.last_sent_at).toLocaleDateString()}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3 align-top">
        <button
          onClick={onDelete}
          className="rounded p-1 text-ink/40 hover:bg-red-50 hover:text-red-600"
          title="Delete lead"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}
