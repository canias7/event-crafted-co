import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// Vendor-side FAQ editor — vendor maintains their own structured Q&A
// shown publicly on their profile. The public renderer (VendorFaqList
// already exists for static FAQs) is upgraded separately to consume
// the dynamic rows. FAQPage rich-result eligibility on the public
// side comes from the JSON-LD block we already render on
// VendorDetailPage.

interface Faq {
  id: string;
  question: string;
  answer: string;
  display_order: number;
}

// Treat any "table not in schema cache" / "relation does not exist"
// surface as a one-shot signal that the migration hasn't deployed
// yet. Components flip into a hidden / pending state instead of
// spamming red toasts at the user.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isTableMissingError(err: any): boolean {
  if (!err) return false;
  if (err.code === "PGRST205" || err.code === "42P01") return true;
  const msg = String(err.message ?? "").toLowerCase();
  return (
    msg.includes("could not find the table") ||
    msg.includes("schema cache") ||
    msg.includes("does not exist")
  );
}

export function VendorFaqsManager({
  vendorId,
  canEdit,
}: {
  vendorId: string;
  canEdit: boolean;
}) {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newQ, setNewQ] = useState("");
  const [newA, setNewA] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  // True when the FAQs table doesn't exist on the deployed database
  // yet (the migration hasn't run). The component renders a tiny
  // "coming soon" notice in place of the editor instead of throwing
  // toast errors every time the vendor lands on the More tab.
  const [tableMissing, setTableMissing] = useState(false);

  async function load() {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("vendor_faqs")
      .select("id, question, answer, display_order")
      .eq("vendor_id", vendorId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (isTableMissingError(error)) {
      setTableMissing(true);
      setFaqs([]);
    } else {
      setFaqs((data as Faq[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (vendorId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  async function addFaq(e: React.FormEvent) {
    e.preventDefault();
    if (!newQ.trim() || !newA.trim()) {
      toast.error("Question and answer are required");
      return;
    }
    setAdding(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("vendor_faqs").insert({
      vendor_id: vendorId,
      question: newQ.trim(),
      answer: newA.trim(),
      display_order: faqs.length,
    });
    setAdding(false);
    if (isTableMissingError(error)) {
      setTableMissing(true);
      return;
    }
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewQ("");
    setNewA("");
    load();
  }

  async function patchFaq(id: string, patch: Partial<Faq>) {
    setSavingId(id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_faqs")
      .update(patch)
      .eq("id", id);
    setSavingId(null);
    if (isTableMissingError(error)) {
      setTableMissing(true);
      return;
    }
    if (error) {
      toast.error(error.message);
      return;
    }
    setFaqs((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  async function remove(id: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("vendor_faqs")
      .delete()
      .eq("id", id);
    if (isTableMissingError(error)) {
      setTableMissing(true);
      return;
    }
    if (error) {
      toast.error(error.message);
      return;
    }
    setFaqs((prev) => prev.filter((f) => f.id !== id));
  }

  if (tableMissing) {
    return (
      <div>
        <div className="mb-3">
          <p className="font-label text-muted-foreground">FAQs</p>
        </div>
        <p className="text-xs text-muted-foreground italic">
          FAQs are coming online soon — this section will activate once the
          server-side update lands.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <p className="font-label text-muted-foreground">FAQs</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Common questions hosts ask. Render publicly on your profile +
          appear in Google's FAQ rich results.
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground py-4">Loading…</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {faqs.map((f) => (
            <li
              key={f.id}
              className="rounded-sm border border-border bg-card p-3 space-y-2"
            >
              <Input
                value={f.question}
                onChange={(e) =>
                  setFaqs((prev) =>
                    prev.map((x) =>
                      x.id === f.id ? { ...x, question: e.target.value } : x,
                    ),
                  )
                }
                onBlur={(e) => patchFaq(f.id, { question: e.target.value })}
                disabled={!canEdit}
                className="font-medium"
              />
              <Textarea
                value={f.answer}
                onChange={(e) =>
                  setFaqs((prev) =>
                    prev.map((x) =>
                      x.id === f.id ? { ...x, answer: e.target.value } : x,
                    ),
                  )
                }
                onBlur={(e) => patchFaq(f.id, { answer: e.target.value })}
                disabled={!canEdit}
                rows={2}
                className="text-sm"
              />
              {canEdit && (
                <div className="flex justify-end items-center gap-2">
                  {savingId === f.id && (
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(f.id)}
                    className="rounded-full text-xs h-7 text-muted-foreground"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Remove
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <form
          onSubmit={addFaq}
          className="rounded-sm border border-dashed border-border p-3 space-y-2"
        >
          <Input
            placeholder="Question (e.g. Do you travel for events?)"
            value={newQ}
            onChange={(e) => setNewQ(e.target.value)}
          />
          <Textarea
            placeholder="Answer"
            value={newA}
            onChange={(e) => setNewA(e.target.value)}
            rows={2}
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={adding || !newQ.trim() || !newA.trim()}
              className="rounded-full"
            >
              {adding ? (
                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
              ) : (
                <Plus className="w-3 h-3 mr-1.5" />
              )}
              Add FAQ
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// Public-facing read of a vendor's FAQs, including a JSON-LD FAQPage
// block for rich results. Returns null when there's nothing to show.
export function VendorFaqsPublic({ vendorId }: { vendorId: string }) {
  const [faqs, setFaqs] = useState<Array<{ q: string; a: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("vendor_faqs")
      .select("question, answer")
      .eq("vendor_id", vendorId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true })
      .then(
        ({
          data,
          error,
        }: {
          data: Array<{ question: string; answer: string }> | null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          error: any;
        }) => {
          if (cancelled) return;
          // Quietly degrade if the table isn't deployed yet — the
          // public surface should never look broken to a host.
          if (isTableMissingError(error)) return;
          setFaqs(
            (data ?? []).map((r) => ({ q: r.question, a: r.answer })),
          );
        },
      );
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  if (faqs.length === 0) return null;
  return (
    <div>
      <p className="font-label text-accent mb-4">FAQ</p>
      <h2 className="font-display text-3xl mb-6">Common questions</h2>
      <div>
        {faqs.map((f) => (
          <details key={f.q} className="group border-b border-border">
            <summary className="flex items-center justify-between py-5 cursor-pointer text-base font-medium list-none">
              {f.q}
            </summary>
            <p className="pb-5 text-sm text-muted-foreground leading-relaxed max-w-lg whitespace-pre-wrap">
              {f.a}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}
