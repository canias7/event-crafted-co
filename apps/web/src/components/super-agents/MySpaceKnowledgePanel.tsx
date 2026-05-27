// My Space knowledge base panel. Slide-over UI for managing the
// vendor's persistent facts (pricing, services, brand voice, FAQ,
// policies). The same entries get auto-loaded into the AI's system
// prompt on every chat turn, and the AI can add/edit/delete via
// tools when the vendor says "remember…" / "from now on…".
//
// This panel is the visual review surface — see what's stored, edit
// wording, prune entries. Most adds will happen through chat.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const CATEGORIES = [
  { key: "pricing", label: "Pricing" },
  { key: "services", label: "Services" },
  { key: "brand_voice", label: "Brand voice" },
  { key: "faq", label: "FAQ" },
  { key: "policies", label: "Policies" },
  { key: "other", label: "Other" },
] as const;

type Category = typeof CATEGORIES[number]["key"];

interface KnowledgeEntry {
  id: string;
  category: Category;
  title: string;
  content: string;
  updated_at: string;
}

function categoryLabel(key: string): string {
  return CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

export function MySpaceKnowledgePanel() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<KnowledgeEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Add form state — controlled inline at the top of the panel.
  const [addOpen, setAddOpen] = useState(false);
  const [draftCategory, setDraftCategory] = useState<Category>("pricing");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit form state — at most one entry in edit mode at a time.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState<Category>("pricing");
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("my_space_knowledge")
      .select("id, category, title, content, updated_at")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("category", { ascending: true })
      .order("created_at", { ascending: true });
    setLoading(false);
    if (error) {
      console.error("[MySpaceKnowledgePanel] load failed", error);
      toast.error("Couldn't load your knowledge base.");
      return;
    }
    setEntries((data ?? []) as KnowledgeEntry[]);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<Category, KnowledgeEntry[]>();
    for (const cat of CATEGORIES) map.set(cat.key, []);
    for (const e of entries ?? []) {
      const arr = map.get(e.category as Category) ?? [];
      arr.push(e);
      map.set(e.category as Category, arr);
    }
    return map;
  }, [entries]);

  const resetDraft = () => {
    setDraftTitle("");
    setDraftContent("");
    setDraftCategory("pricing");
    setAddOpen(false);
  };

  const handleAdd = async () => {
    if (!user?.id) return;
    const title = draftTitle.trim();
    const content = draftContent.trim();
    if (!title || !content) {
      toast.error("Title and content are required.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("my_space_knowledge").insert({
      user_id: user.id,
      category: draftCategory,
      title: title.slice(0, 200),
      content: content.slice(0, 4000),
    });
    setSaving(false);
    if (error) {
      console.error("[MySpaceKnowledgePanel] insert failed", error);
      toast.error(error.message);
      return;
    }
    toast.success("Saved.");
    resetDraft();
    void load();
  };

  const startEdit = (entry: KnowledgeEntry) => {
    setEditingId(entry.id);
    setEditTitle(entry.title);
    setEditContent(entry.content);
    setEditCategory(entry.category);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
    setEditContent("");
  };

  const handleSaveEdit = async (id: string) => {
    if (!user?.id) return;
    const title = editTitle.trim();
    const content = editContent.trim();
    if (!title || !content) {
      toast.error("Title and content are required.");
      return;
    }
    setEditSaving(true);
    const { error } = await supabase
      .from("my_space_knowledge")
      .update({
        title: title.slice(0, 200),
        content: content.slice(0, 4000),
        category: editCategory,
      })
      .eq("id", id)
      .eq("user_id", user.id);
    setEditSaving(false);
    if (error) {
      console.error("[MySpaceKnowledgePanel] update failed", error);
      toast.error(error.message);
      return;
    }
    toast.success("Updated.");
    cancelEdit();
    void load();
  };

  const handleDelete = async (id: string, title: string) => {
    if (!user?.id) return;
    if (!window.confirm(`Delete "${title}"? The AI will forget this.`)) return;
    const { error } = await supabase
      .from("my_space_knowledge")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) {
      console.error("[MySpaceKnowledgePanel] delete failed", error);
      toast.error(error.message);
      return;
    }
    toast.success("Deleted.");
    void load();
  };

  const totalCount = entries?.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-muted-foreground leading-relaxed">
        Facts My Space remembers about your business —{" "}
        <span className="text-foreground">applied on every chat</span>. Add a
        pricing rule once, and the AI will use it when drafting host replies,
        proposals, follow-ups. Most adds happen through chat ("remember that
        my hourly rate is $150"), but you can manage them here too.
      </div>

      {/* Add new entry */}
      {addOpen ? (
        <div
          className="rounded-xl border p-4 space-y-3"
          style={{ borderColor: "rgba(255,138,76,0.4)", background: "rgba(255,138,76,0.06)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-muted-foreground">
              Category
            </label>
            <button
              type="button"
              onClick={resetDraft}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <select
            value={draftCategory}
            onChange={(e) => setDraftCategory(e.target.value as Category)}
            className="w-full text-sm rounded-lg px-3 py-2 bg-background border outline-none"
          >
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            maxLength={200}
            placeholder='Short label (e.g. "Hourly rate")'
            className="w-full text-sm rounded-lg px-3 py-2 bg-background border outline-none"
          />
          <textarea
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            maxLength={4000}
            rows={4}
            placeholder='The fact ("$150/hr for events under 4 hours, $125/hr above")'
            className="w-full text-sm rounded-lg px-3 py-2 bg-background border outline-none resize-y"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={resetDraft}
              className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || !draftTitle.trim() || !draftContent.trim()}
              className="inline-flex items-center gap-1.5 text-sm font-medium rounded-lg px-3 py-1.5 disabled:opacity-50"
              style={{ background: "rgba(255,138,76,0.18)", color: "#c4541e" }}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center justify-center gap-2 text-sm font-medium rounded-xl px-3 py-2 self-start"
          style={{ background: "rgba(255,138,76,0.18)", color: "#c4541e" }}
        >
          <Plus className="w-4 h-4" />
          Add a fact
        </button>
      )}

      {/* List */}
      {loading ? (
        <div className="text-xs text-muted-foreground inline-flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading…
        </div>
      ) : totalCount === 0 ? (
        <p className="text-sm text-muted-foreground leading-relaxed">
          Nothing saved yet. Try telling My Space something like{" "}
          <span className="text-foreground">"remember that my hourly rate is $150"</span>{" "}
          or{" "}
          <span className="text-foreground">"from now on always sign as Jamie"</span>{" "}
          — the AI will save it here automatically.
        </p>
      ) : (
        <div className="space-y-5">
          {CATEGORIES.map((cat) => {
            const items = grouped.get(cat.key) ?? [];
            if (items.length === 0) return null;
            return (
              <section key={cat.key} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {cat.label}
                </h3>
                <ul className="space-y-2">
                  {items.map((entry) => {
                    const isEditing = editingId === entry.id;
                    if (isEditing) {
                      return (
                        <li
                          key={entry.id}
                          className="rounded-xl border p-3 space-y-2"
                          style={{ borderColor: "rgba(255,138,76,0.4)" }}
                        >
                          <select
                            value={editCategory}
                            onChange={(e) =>
                              setEditCategory(e.target.value as Category)}
                            className="w-full text-xs rounded-lg px-2 py-1.5 bg-background border outline-none"
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c.key} value={c.key}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            maxLength={200}
                            className="w-full text-sm font-medium rounded-lg px-2 py-1.5 bg-background border outline-none"
                          />
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            maxLength={4000}
                            rows={3}
                            className="w-full text-sm rounded-lg px-2 py-1.5 bg-background border outline-none resize-y"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(entry.id)}
                              disabled={editSaving}
                              className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1 disabled:opacity-50"
                              style={{
                                background: "rgba(255,138,76,0.18)",
                                color: "#c4541e",
                              }}
                            >
                              {editSaving
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Save className="w-3 h-3" />}
                              Save
                            </button>
                          </div>
                        </li>
                      );
                    }
                    return (
                      <li
                        key={entry.id}
                        className="rounded-xl border p-3 group"
                        style={{ borderColor: "rgba(255,138,76,0.18)" }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-tight">
                              {entry.title}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                              {entry.content}
                            </p>
                          </div>
                          <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => startEdit(entry)}
                              className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground"
                              aria-label="Edit"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(entry.id, entry.title)}
                              className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-destructive"
                              aria-label="Delete"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
