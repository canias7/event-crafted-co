import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, Pencil, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  from_name: string | null;
  from_address: string | null;
  created_at: string;
  updated_at: string;
};

const PLACEHOLDER_HELP =
  "Available variables: {{name}}, {{email}}, {{source}}. Anything in {{double curlies}} that doesn't match a real variable will render literally.";

export function TemplatesPage() {
  const [rows, setRows] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("email_templates")
      .select("id, name, subject, body, from_name, from_address, created_at, updated_at")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data ?? []) as EmailTemplate[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveTemplate(
    form: {
      name: string;
      subject: string;
      body: string;
      from_name: string;
      from_address: string;
    },
    id?: string,
  ) {
    const payload = {
      name: form.name.trim(),
      subject: form.subject.trim(),
      body: form.body,
      from_name: form.from_name.trim() || null,
      from_address: form.from_address.trim() || null,
    };
    if (!payload.name || !payload.subject || !payload.body.trim()) {
      toast.error("Name, subject, and body are required");
      return false;
    }
    if (id) {
      const { data, error } = await supabase
        .from("email_templates")
        .update(payload)
        .eq("id", id)
        .select("id, name, subject, body, from_name, from_address, created_at, updated_at")
        .single();
      if (error) {
        toast.error(error.message);
        return false;
      }
      setRows((p) => p.map((r) => (r.id === id ? (data as EmailTemplate) : r)));
      toast.success("Template updated");
    } else {
      const { data, error } = await supabase
        .from("email_templates")
        .insert(payload)
        .select("id, name, subject, body, from_name, from_address, created_at, updated_at")
        .single();
      if (error) {
        toast.error(error.message);
        return false;
      }
      setRows((p) => [data as EmailTemplate, ...p]);
      toast.success("Template created");
    }
    return true;
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Delete this template?")) return;
    const { error } = await supabase
      .from("email_templates")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((p) => p.filter((r) => r.id !== id));
    toast.success("Template deleted");
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
          <h1 className="text-2xl font-semibold">Email templates</h1>
          <p className="mt-1 text-sm text-ink/60">
            Reusable outreach emails. Pick one on the Email leads tab to send.
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setShowAdd((s) => !s);
          }}
          className="flex items-center gap-2 rounded bg-ink px-4 py-2 text-sm font-medium text-bone hover:bg-ink/90"
        >
          <Plus className="h-4 w-4" />
          {showAdd ? "Cancel" : "New template"}
        </button>
      </div>

      {showAdd ? (
        <TemplateForm
          mode="create"
          onCancel={() => setShowAdd(false)}
          onSubmit={async (form) => {
            const ok = await saveTemplate(form);
            if (ok) setShowAdd(false);
          }}
        />
      ) : null}

      {editing ? (
        <TemplateForm
          mode="edit"
          initial={editing}
          onCancel={() => setEditing(null)}
          onSubmit={async (form) => {
            const ok = await saveTemplate(form, editing.id);
            if (ok) setEditing(null);
          }}
        />
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-ink/60">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-10 text-sm text-ink/60">
          No templates yet. Create one to get started.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((t) => (
            <li
              key={t.id}
              className="flex items-start gap-4 rounded-lg border border-ink/10 bg-white p-5"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.name}</p>
                <p className="mt-0.5 text-sm text-ink/70">{t.subject}</p>
                <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-ink/60">
                  {t.body}
                </p>
                <p className="mt-2 text-xs text-ink/40">
                  {t.from_address ? (
                    <>
                      From {t.from_name ? `${t.from_name} <${t.from_address}>` : t.from_address}
                      {" · "}
                    </>
                  ) : null}
                  Updated {new Date(t.updated_at).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => {
                    setShowAdd(false);
                    setEditing(t);
                  }}
                  className="rounded p-2 text-ink/60 hover:bg-ink/5 hover:text-ink"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => deleteTemplate(t.id)}
                  className="rounded p-2 text-ink/40 hover:bg-red-50 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TemplateForm({
  mode,
  initial,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  initial?: EmailTemplate;
  onCancel: () => void;
  onSubmit: (f: {
    name: string;
    subject: string;
    body: string;
    from_name: string;
    from_address: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [fromName, setFromName] = useState(initial?.from_name ?? "");
  const [fromAddress, setFromAddress] = useState(initial?.from_address ?? "");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="mt-6 rounded-lg border border-ink/10 bg-white p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSubmit({
          name,
          subject,
          body,
          from_name: fromName,
          from_address: fromAddress,
        });
        setBusy(false);
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {mode === "create" ? "New template" : `Edit “${initial?.name ?? ""}”`}
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="rounded p-1 text-ink/50 hover:bg-ink/5 hover:text-ink"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3">
        <label className="text-sm">
          <span className="block text-xs uppercase tracking-wide text-ink/60">
            Name <span className="text-red-500">*</span>
          </span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Photographer cold intro"
            className="mt-1 w-full rounded border border-ink/15 px-3 py-2 outline-none focus:border-ink/40"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs uppercase tracking-wide text-ink/60">
            Subject <span className="text-red-500">*</span>
          </span>
          <input
            type="text"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Vendora x {{name}} — collab?"
            className="mt-1 w-full rounded border border-ink/15 px-3 py-2 outline-none focus:border-ink/40"
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="block text-xs uppercase tracking-wide text-ink/60">
              From name
            </span>
            <input
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Chris from Vendora"
              className="mt-1 w-full rounded border border-ink/15 px-3 py-2 outline-none focus:border-ink/40"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs uppercase tracking-wide text-ink/60">
              From address
            </span>
            <input
              type="email"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
              placeholder="chris@eventvendora.com"
              className="mt-1 w-full rounded border border-ink/15 px-3 py-2 outline-none focus:border-ink/40"
            />
            <p className="mt-1 text-[11px] text-ink/50">
              Must be on a domain verified in Resend. Leave blank to use the
              default noreply@.
            </p>
          </label>
        </div>
        <label className="text-sm">
          <span className="block text-xs uppercase tracking-wide text-ink/60">
            Body <span className="text-red-500">*</span>
          </span>
          <textarea
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            placeholder={
              "Hey {{name}},\n\nI run Vendora — we're a curated marketplace for event vendors in your area. I came across your work and think your style would resonate with our hosts.\n\nWould you be open to a 15-min intro call this week?\n\n—\nVendora team"
            }
            className="mt-1 w-full rounded border border-ink/15 px-3 py-2 font-mono text-[13px] leading-relaxed outline-none focus:border-ink/40"
          />
          <p className="mt-1 text-[11px] text-ink/50">{PLACEHOLDER_HELP}</p>
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-ink/15 px-4 py-2 text-sm text-ink/70 hover:bg-ink/5"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-ink px-4 py-2 text-sm font-medium text-bone hover:bg-ink/90 disabled:opacity-50"
        >
          {busy ? "Saving…" : mode === "create" ? "Save template" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
