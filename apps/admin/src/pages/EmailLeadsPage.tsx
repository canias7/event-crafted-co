import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
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
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LeadStatus | "all">("all");
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("email_leads")
      .select("id, email, name, source, status, notes, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(500);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data ?? []) as EmailLead[]);
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
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <LeadRow
                  key={r.id}
                  lead={r}
                  onStatus={(next) => updateStatus(r.id, next)}
                  onNotes={(next) => updateNotes(r.id, next)}
                  onDelete={() => deleteLead(r.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
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
  onStatus,
  onNotes,
  onDelete,
}: {
  lead: EmailLead;
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
