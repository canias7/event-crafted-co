import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, GripVertical, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type IntakeFieldType =
  | "text"
  | "number"
  | "select"
  | "multiselect"
  | "yesno";

export interface IntakeQuestion {
  id: string;
  label: string;
  type: IntakeFieldType;
  options?: string[];
  required?: boolean;
  helper?: string;
}

interface FormRow {
  vendor_id: string;
  intro: string | null;
  questions: IntakeQuestion[];
  is_published: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// Cast to any: the typed `questions` column is Json but we work with
// IntakeQuestion[] internally; the conversion both ways needs the
// any-shaped table or a strict `as unknown as` everywhere.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formsTable = () => (supabase as any).from("vendor_intake_forms");

const TYPE_LABELS: Record<IntakeFieldType, string> = {
  text: "Short answer",
  number: "Number",
  select: "Pick one",
  multiselect: "Pick many",
  yesno: "Yes / No",
};

function blankQuestion(): IntakeQuestion {
  return {
    id: crypto.randomUUID(),
    label: "",
    type: "text",
    required: false,
  };
}

export function IntakeFormEditor({
  vendorId,
  canEdit,
}: {
  vendorId: string;
  canEdit: boolean;
}) {
  const [intro, setIntro] = useState("");
  const [questions, setQuestions] = useState<IntakeQuestion[]>([]);
  const [isPublished, setIsPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exists, setExists] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await formsTable()
      .select("vendor_id, intro, questions, is_published")
      .eq("vendor_id", vendorId)
      .maybeSingle();
    const row = (data as FormRow | null) ?? null;
    if (row) {
      setIntro(row.intro ?? "");
      setQuestions(
        Array.isArray(row.questions) ? row.questions : [],
      );
      setIsPublished(row.is_published);
      setExists(true);
    } else {
      setIntro("");
      setQuestions([]);
      setIsPublished(false);
      setExists(false);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (vendorId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  function patchQuestion(idx: number, patch: Partial<IntakeQuestion>) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)),
    );
  }

  async function save(publish?: boolean) {
    if (questions.some((q) => !q.label.trim())) {
      toast.error("Every question needs a label");
      return;
    }
    setSaving(true);
    const payload = {
      vendor_id: vendorId,
      intro: intro.trim() || null,
      questions,
      is_published: publish ?? isPublished,
    };
    const { error } = exists
      ? await formsTable().update(payload).eq("vendor_id", vendorId)
      : await formsTable().insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setExists(true);
    if (publish !== undefined) setIsPublished(publish);
    toast.success(publish === false ? "Saved as draft" : "Form saved");
  }

  if (loading) {
    return (
      <div className="text-center text-muted-foreground text-sm py-6">
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-label text-muted-foreground">
            Intake questionnaire
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Replaces "special requests" with structured questions hosts
            fill out — better signal in your inbox
          </p>
        </div>
        {canEdit && (
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              isPublished
                ? "bg-accent/15 text-accent border border-accent/30"
                : "bg-secondary text-muted-foreground border border-border"
            }`}
          >
            {isPublished ? "Live on inquiry form" : "Draft"}
          </span>
        )}
      </div>

      <div className="space-y-3 bg-card border border-border rounded-sm p-4">
        <div className="space-y-2">
          <Label htmlFor="intake-intro">Intro (optional)</Label>
          <Textarea
            id="intake-intro"
            rows={2}
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            placeholder="A short note that appears above the questions when hosts open your inquiry form."
            disabled={!canEdit}
          />
        </div>

        {questions.length === 0 ? (
          <div className="border border-dashed border-border rounded-sm p-6 text-center">
            <Sparkles className="w-6 h-6 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
              No questions yet. Add 3–5 short ones (date, headcount,
              must-haves) — keeps inquiries focused.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {questions.map((q, i) => (
              <div
                key={q.id}
                className="rounded-sm border border-border bg-background p-3 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <GripVertical className="w-4 h-4 text-muted-foreground/40 mt-2.5 shrink-0" />
                  <Input
                    value={q.label}
                    onChange={(e) =>
                      patchQuestion(i, { label: e.target.value })
                    }
                    placeholder="Question label, e.g. 'Indoor or outdoor?'"
                    disabled={!canEdit}
                    className="h-9"
                  />
                  <Select
                    value={q.type}
                    onValueChange={(v) =>
                      patchQuestion(i, { type: v as IntakeFieldType })
                    }
                    disabled={!canEdit}
                  >
                    <SelectTrigger className="w-[140px] h-9 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() =>
                        setQuestions((prev) =>
                          prev.filter((x) => x.id !== q.id),
                        )
                      }
                      aria-label="Remove question"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  )}
                </div>
                {(q.type === "select" || q.type === "multiselect") && (
                  <Input
                    value={(q.options ?? []).join(", ")}
                    onChange={(e) =>
                      patchQuestion(i, {
                        options: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="Comma-separated options"
                    disabled={!canEdit}
                    className="h-8 text-xs ml-6"
                  />
                )}
                <div className="flex items-center gap-2 ml-6">
                  <input
                    type="checkbox"
                    id={`req-${q.id}`}
                    checked={q.required ?? false}
                    onChange={(e) =>
                      patchQuestion(i, { required: e.target.checked })
                    }
                    disabled={!canEdit}
                    className="rounded"
                  />
                  <Label
                    htmlFor={`req-${q.id}`}
                    className="text-xs text-muted-foreground"
                  >
                    Required
                  </Label>
                </div>
              </div>
            ))}
          </div>
        )}

        {canEdit && (
          <div className="flex items-center justify-between gap-2 flex-wrap pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setQuestions((prev) => [...prev, blankQuestion()])
              }
              className="rounded-full"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add question
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => save(false)}
                className="rounded-full"
              >
                {saving && (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                )}
                Save as draft
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving || questions.length === 0}
                onClick={() => save(true)}
                className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                {saving && (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                )}
                {isPublished ? "Save changes" : "Publish"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
