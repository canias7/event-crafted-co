// Host's invitation editor (owner's call, Oct 2026). Three tabs:
//   Look      — classic / evening / photo, a cover photo, a welcome message
//   Questions — plus-ones, meal options, dietary needs, a song request and
//               up to 5 questions of the host's own
//   Rules     — reply-by date, guest limit, whether guests see the counts
// Saved straight onto host_events; the public /rsvp/:token page reads it.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ExternalLink, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { compressImageIfNeeded } from "@/lib/imageCompress";
import {
  INVITE_STYLES,
  MAX_MEAL_OPTIONS,
  MAX_PLUS_ONES,
  MAX_QUESTIONS,
  type InviteQuestion,
  type InviteStyle,
} from "@/lib/invitations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface InvitationSettings {
  invite_style: InviteStyle;
  invite_cover_url: string | null;
  invite_message: string | null;
  rsvp_deadline: string | null;
  rsvp_guest_limit: number | null;
  rsvp_show_counts: boolean;
  rsvp_plus_ones_max: number;
  rsvp_meal_options: string[];
  rsvp_ask_dietary: boolean;
  rsvp_ask_song: boolean;
  rsvp_questions: InviteQuestion[];
}

export const INVITATION_COLUMNS =
  "invite_style, invite_cover_url, invite_message, rsvp_deadline, rsvp_guest_limit, rsvp_show_counts, rsvp_plus_ones_max, rsvp_meal_options, rsvp_ask_dietary, rsvp_ask_song, rsvp_questions";

export function defaultInvitation(): InvitationSettings {
  return {
    invite_style: "classic",
    invite_cover_url: null,
    invite_message: null,
    rsvp_deadline: null,
    rsvp_guest_limit: null,
    rsvp_show_counts: true,
    rsvp_plus_ones_max: 0,
    rsvp_meal_options: [],
    rsvp_ask_dietary: false,
    rsvp_ask_song: false,
    rsvp_questions: [],
  };
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function InvitationDialog({
  open,
  onOpenChange,
  eventId,
  eventTitle,
  shareToken,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventTitle: string;
  shareToken: string;
  initial: InvitationSettings;
  onSaved: (s: InvitationSettings) => void;
}) {
  const { t } = useTranslation("hostEvents");
  const { user } = useAuth();
  const [s, setS] = useState<InvitationSettings>(initial);
  const [limitText, setLimitText] = useState("");
  const [newMeal, setNewMeal] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setS(initial);
    setLimitText(initial.rsvp_guest_limit ? String(initial.rsvp_guest_limit) : "");
    setNewMeal("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof InvitationSettings>(k: K, v: InvitationSettings[K]) =>
    setS((p) => ({ ...p, [k]: v }));

  async function uploadCover(file: File) {
    if (!user) return;
    setUploading(true);
    try {
      const f = await compressImageIfNeeded(file);
      const ext = (f.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
      const path = `${user.id}/${eventId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("event-invites")
        .upload(path, f, { contentType: f.type, upsert: false, cacheControl: "3600" });
      if (error) throw error;
      const { data } = supabase.storage.from("event-invites").getPublicUrl(path);
      set("invite_cover_url", data.publicUrl);
    } catch {
      toast.error(t("invite.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  function addMeal() {
    const v = newMeal.trim().slice(0, 60);
    if (!v || s.rsvp_meal_options.includes(v) || s.rsvp_meal_options.length >= MAX_MEAL_OPTIONS) return;
    set("rsvp_meal_options", [...s.rsvp_meal_options, v]);
    setNewMeal("");
  }

  async function save() {
    const limit = limitText.trim() ? parseInt(limitText, 10) : null;
    if (limit !== null && (!Number.isFinite(limit) || limit < 1 || limit > 5000)) {
      toast.error(t("invite.limitInvalid"));
      return;
    }
    const questions = s.rsvp_questions
      .map((q) => ({ id: q.id, label: q.label.trim().slice(0, 200) }))
      .filter((q) => q.label);
    const next: InvitationSettings = {
      ...s,
      invite_message: s.invite_message?.trim() ? s.invite_message.trim().slice(0, 1000) : null,
      rsvp_guest_limit: limit,
      rsvp_questions: questions,
      // A photo look without a photo falls back to classic.
      invite_style: s.invite_style === "photo" && !s.invite_cover_url ? "classic" : s.invite_style,
    };
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("host_events").update(next).eq("id", eventId);
    setSaving(false);
    if (error) {
      toast.error(t("invite.saveFailed"));
      return;
    }
    toast.success(t("invite.saved"));
    onSaved(next);
    onOpenChange(false);
  }

  const tile = (on: boolean) =>
    `rounded-xl border p-3 text-left transition-colors ${on ? "border-foreground" : "border-border hover:border-foreground/40"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-editorial text-2xl">{t("invite.title")}</DialogTitle>
          <DialogDescription>{t("invite.description", { title: eventTitle })}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="look">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="look">{t("invite.tabs.look")}</TabsTrigger>
            <TabsTrigger value="questions">{t("invite.tabs.questions")}</TabsTrigger>
            <TabsTrigger value="rules">{t("invite.tabs.rules")}</TabsTrigger>
          </TabsList>

          <TabsContent value="look" className="space-y-5 pt-4">
            <div>
              <p className="text-sm font-bold mb-2">{t("invite.style")}</p>
              <div className="grid grid-cols-3 gap-2">
                {INVITE_STYLES.map((st) => (
                  <button key={st} type="button" onClick={() => set("invite_style", st)} className={tile(s.invite_style === st)} aria-pressed={s.invite_style === st}>
                    <span
                      aria-hidden
                      className={`block h-14 rounded-lg mb-2 border border-border ${
                        st === "classic" ? "surface-light bg-background" : st === "evening" ? "dark bg-background" : "bg-muted"
                      }`}
                      style={
                        st === "photo" && s.invite_cover_url
                          ? { backgroundImage: `url(${s.invite_cover_url})`, backgroundSize: "cover", backgroundPosition: "center" }
                          : undefined
                      }
                    >
                      <span className="flex h-full items-center justify-center">
                        <span className="h-1.5 w-1.5 rotate-45 bg-gold" />
                      </span>
                    </span>
                    <span className="block text-sm font-bold">{t(`invite.styles.${st}`)}</span>
                    <span className="block text-xs">{t(`invite.styleHints.${st}`)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-bold mb-2">{t("invite.cover")}</p>
              {s.invite_cover_url ? (
                <div className="relative">
                  <img src={s.invite_cover_url} alt="" className="w-full aspect-[3/2] object-cover rounded-xl" />
                  <button
                    type="button"
                    onClick={() => set("invite_cover_url", null)}
                    className="absolute top-2 right-2 inline-flex h-9 items-center gap-1 rounded-full bg-card px-3 text-xs font-bold shadow-soft hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" /> {t("invite.removeCover")}
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card h-24 text-sm font-bold hover:text-accent">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  {t("invite.addCover")}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadCover(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              {s.invite_style === "photo" && !s.invite_cover_url ? (
                <p className="mt-1.5 text-xs text-accent">{t("invite.photoNeedsCover")}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="inv-msg" className="text-sm font-bold mb-2 block">{t("invite.message")}</label>
              <Textarea
                id="inv-msg"
                rows={3}
                maxLength={1000}
                value={s.invite_message ?? ""}
                onChange={(e) => set("invite_message", e.target.value)}
                placeholder={t("invite.messagePlaceholder")}
              />
            </div>
          </TabsContent>

          <TabsContent value="questions" className="space-y-5 pt-4">
            <p className="text-sm">{t("invite.alwaysAsked")}</p>

            <div>
              <label htmlFor="inv-plus" className="text-sm font-bold mb-2 block">{t("invite.plusOnes")}</label>
              <select
                id="inv-plus"
                value={s.rsvp_plus_ones_max}
                onChange={(e) => set("rsvp_plus_ones_max", Number(e.target.value))}
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
              >
                {Array.from({ length: MAX_PLUS_ONES + 1 }, (_, n) => (
                  <option key={n} value={n}>
                    {n === 0 ? t("invite.plusOff") : t("invite.plusUpTo", { count: n })}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-sm font-bold mb-1">{t("invite.meals")}</p>
              <p className="text-xs mb-2">{t("invite.mealsHint")}</p>
              <div className="flex flex-wrap gap-2 mb-2">
                {s.rsvp_meal_options.map((m) => (
                  <span key={m} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 h-8 text-sm">
                    {m}
                    <button
                      type="button"
                      aria-label={t("invite.removeOption", { name: m })}
                      onClick={() => set("rsvp_meal_options", s.rsvp_meal_options.filter((x) => x !== m))}
                      className="hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
              {s.rsvp_meal_options.length < MAX_MEAL_OPTIONS ? (
                <div className="flex gap-2">
                  <Input
                    value={newMeal}
                    maxLength={60}
                    onChange={(e) => setNewMeal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addMeal();
                      }
                    }}
                    placeholder={t("invite.mealPlaceholder")}
                  />
                  <Button type="button" variant="outline" onClick={addMeal} disabled={!newMeal.trim()}>
                    <Plus className="h-4 w-4" /> {t("invite.add")}
                  </Button>
                </div>
              ) : null}
            </div>

            <ToggleRow label={t("invite.askDietary")} checked={s.rsvp_ask_dietary} onChange={(v) => set("rsvp_ask_dietary", v)} />
            <ToggleRow label={t("invite.askSong")} checked={s.rsvp_ask_song} onChange={(v) => set("rsvp_ask_song", v)} />

            <div>
              <p className="text-sm font-bold mb-1">{t("invite.ownQuestions")}</p>
              <p className="text-xs mb-2">{t("invite.ownQuestionsHint", { count: MAX_QUESTIONS })}</p>
              <div className="space-y-2">
                {s.rsvp_questions.map((q, idx) => (
                  <div key={q.id} className="flex gap-2">
                    <Input
                      value={q.label}
                      maxLength={200}
                      aria-label={t("invite.questionN", { n: idx + 1 })}
                      placeholder={t("invite.questionPlaceholder")}
                      onChange={(e) =>
                        set(
                          "rsvp_questions",
                          s.rsvp_questions.map((x) => (x.id === q.id ? { ...x, label: e.target.value } : x)),
                        )
                      }
                    />
                    <button
                      type="button"
                      aria-label={t("invite.removeQuestion")}
                      onClick={() => set("rsvp_questions", s.rsvp_questions.filter((x) => x.id !== q.id))}
                      className="shrink-0 p-2 rounded-full hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              {s.rsvp_questions.length < MAX_QUESTIONS ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => set("rsvp_questions", [...s.rsvp_questions, { id: newId(), label: "" }])}
                >
                  <Plus className="h-4 w-4" /> {t("invite.addQuestion")}
                </Button>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="rules" className="space-y-5 pt-4">
            <div>
              <label htmlFor="inv-deadline" className="text-sm font-bold mb-2 block">{t("invite.deadline")}</label>
              <div className="flex gap-2">
                <Input
                  id="inv-deadline"
                  type="date"
                  value={s.rsvp_deadline ?? ""}
                  onChange={(e) => set("rsvp_deadline", e.target.value || null)}
                />
                {s.rsvp_deadline ? (
                  <Button type="button" variant="ghost" onClick={() => set("rsvp_deadline", null)}>
                    {t("invite.clear")}
                  </Button>
                ) : null}
              </div>
              <p className="mt-1.5 text-xs">{t("invite.deadlineHint")}</p>
            </div>
            <div>
              <label htmlFor="inv-limit" className="text-sm font-bold mb-2 block">{t("invite.limit")}</label>
              <Input
                id="inv-limit"
                inputMode="numeric"
                value={limitText}
                onChange={(e) => setLimitText(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                placeholder={t("invite.limitPlaceholder")}
              />
              <p className="mt-1.5 text-xs">{t("invite.limitHint")}</p>
            </div>
            <ToggleRow label={t("invite.showCounts")} hint={t("invite.showCountsHint")} checked={s.rsvp_show_counts} onChange={(v) => set("rsvp_show_counts", v)} />
          </TabsContent>
        </Tabs>

        <div className="mt-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-border pt-4">
          <a
            href={`/rsvp/${shareToken}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-bold hover:text-accent"
          >
            <ExternalLink className="h-4 w-4" /> {t("invite.preview")}
          </a>
          <Button onClick={() => void save()} disabled={saving || uploading}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("invite.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 cursor-pointer">
      <span className="min-w-0">
        <span className="block text-sm font-bold">{label}</span>
        {hint ? <span className="block text-xs mt-0.5">{hint}</span> : null}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
