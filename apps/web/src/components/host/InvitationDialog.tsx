// Host's invitation editor (owner's call, Oct 2026). Four tabs:
//   Design    — a ready-made design for the occasion, or colours, lettering,
//               decoration and a frame one by one, with a live preview
//   Look      — card or photo layout, a cover photo, a welcome message
//   Questions — plus-ones, meal options, dietary needs, a song request and
//               up to 5 questions of the host's own
//   Rules     — reply-by date, guest limit, whether guests see the counts
// Saved straight onto host_events; the public /rsvp/:token page reads it.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, ExternalLink, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { compressImageIfNeeded } from "@/lib/imageCompress";
import {
  MAX_MEAL_OPTIONS,
  MAX_PLUS_ONES,
  MAX_QUESTIONS,
  type InviteQuestion,
  type InviteStyle,
} from "@/lib/invitations";
import {
  FONT_KEYS,
  FONTS,
  OCCASION_KEYS,
  OCCASIONS,
  ORNAMENT_KEYS,
  PALETTE_KEYS,
  PALETTES,
  bodyStyle,
  designVars,
  isDarkDesign,
  loadInviteFonts,
  readDesign,
  resolvePalette,
  type InviteDesign,
  type PaletteKey,
} from "@/lib/inviteDesign";
import { InviteHeader } from "@/components/invite/InviteHeader";
import { InviteOrnament } from "@/components/invite/InviteOrnament";
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
  invite_design: InviteDesign;
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
  "invite_style, invite_cover_url, invite_message, invite_design, rsvp_deadline, rsvp_guest_limit, rsvp_show_counts, rsvp_plus_ones_max, rsvp_meal_options, rsvp_ask_dietary, rsvp_ask_song, rsvp_questions";

export function defaultInvitation(): InvitationSettings {
  return {
    invite_style: "classic",
    invite_cover_url: null,
    invite_message: null,
    invite_design: readDesign(null),
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
    // Older invitations have no design yet: "evening" becomes the midnight colours.
    setS({ ...initial, invite_design: readDesign(initial.invite_design, initial.invite_style) });
    loadInviteFonts(FONT_KEYS);
    setLimitText(initial.rsvp_guest_limit ? String(initial.rsvp_guest_limit) : "");
    setNewMeal("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof InvitationSettings>(k: K, v: InvitationSettings[K]) =>
    setS((p) => ({ ...p, [k]: v }));
  const setDesign = (patch: Partial<InviteDesign>) =>
    setS((p) => ({ ...p, invite_design: { ...p.invite_design, ...patch } }));

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
      // invite_style keeps the layout (and, for the apps' older screens, light
      // or dark): a photo layout without a photo falls back to the card.
      invite_style:
        s.invite_style === "photo" && s.invite_cover_url
          ? "photo"
          : isDarkDesign(s.invite_design)
            ? "evening"
            : "classic",
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

  // Four tabs share a phone's width: a smaller label there.
  const tabCls = "px-1 text-xs sm:text-sm";
  const tile = (on: boolean) =>
    `rounded-xl border p-3 text-left transition-colors ${on ? "border-foreground" : "border-border hover:border-foreground/40"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-editorial text-2xl">{t("invite.title")}</DialogTitle>
          <DialogDescription>{t("invite.description", { title: eventTitle })}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="design">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="design" className={tabCls}>{t("invite.tabs.design")}</TabsTrigger>
            <TabsTrigger value="look" className={tabCls}>{t("invite.tabs.look")}</TabsTrigger>
            <TabsTrigger value="questions" className={tabCls}>{t("invite.tabs.questions")}</TabsTrigger>
            <TabsTrigger value="rules" className={tabCls}>{t("invite.tabs.rules")}</TabsTrigger>
          </TabsList>

          <TabsContent value="design" className="space-y-6 pt-4">
            <DesignPreview s={s} title={eventTitle} invitedLabel={t("invite.previewInvited")} />

            <div>
              <p className="text-sm font-bold">{t("invite.occasion")}</p>
              <p className="text-xs mb-2">{t("invite.occasionHint")}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {OCCASION_KEYS.map((k) => {
                  const o = OCCASIONS[k];
                  const p = PALETTES[o.palette as Exclude<PaletteKey, "custom">];
                  const d = s.invite_design;
                  const on = d.palette === o.palette && d.font === o.font && d.ornament === o.ornament && d.frame === o.frame;
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDesign({ ...o, bg: undefined, accent: undefined })}
                      className={tile(on)}
                    >
                      <span
                        aria-hidden
                        className="flex h-10 items-center justify-center rounded-lg mb-2 border border-border"
                        style={{ background: p.bg, color: p.accent }}
                      >
                        <InviteOrnament kind={o.ornament === "none" ? "diamond" : o.ornament} className="w-20 h-auto" />
                      </span>
                      <span className="block text-xs font-bold">{t(`invite.occasions.${k}`)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-sm font-bold mb-2">{t("invite.colours")}</p>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {PALETTE_KEYS.map((k) => {
                  const on = s.invite_design.palette === k;
                  const p = k === "custom" ? resolvePalette({ ...s.invite_design, palette: "custom" }) : PALETTES[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDesign({ palette: k })}
                      className="flex flex-col items-center gap-1 rounded-xl p-1.5 hover:text-accent"
                    >
                      <span
                        aria-hidden
                        className={`relative flex h-11 w-11 items-center justify-center rounded-full border ${on ? "border-foreground ring-2 ring-foreground ring-offset-2 ring-offset-card" : "border-border"}`}
                        style={k === "custom" && !s.invite_design.bg ? { background: "conic-gradient(#d9a19a, #c9a86a, #9fb592, #93bfdb, #b9a6d9, #d9a19a)" } : { background: p.bg }}
                      >
                        <span className="h-4 w-4 rounded-full" style={{ background: p.accent }} />
                        {on ? <Check className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-foreground p-0.5 text-background" /> : null}
                      </span>
                      <span className="text-[11px] font-bold leading-tight text-center">{t(`invite.palettes.${k}`)}</span>
                    </button>
                  );
                })}
              </div>
              {s.invite_design.palette === "custom" ? (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {(["bg", "accent"] as const).map((k) => (
                    <label key={k} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 h-12 cursor-pointer">
                      <input
                        type="color"
                        value={resolvePalette(s.invite_design)[k]}
                        onChange={(e) => setDesign({ [k]: e.target.value })}
                        className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
                      />
                      <span className="text-sm font-bold">{t(`invite.custom.${k}`)}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>

            <div>
              <p className="text-sm font-bold mb-2">{t("invite.lettering")}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {FONT_KEYS.map((k) => {
                  const f = FONTS[k];
                  const on = s.invite_design.font === k;
                  return (
                    <button key={k} type="button" aria-pressed={on} onClick={() => setDesign({ font: k })} className={tile(on)}>
                      <span
                        aria-hidden
                        className="block truncate text-xl leading-snug"
                        style={{
                          fontFamily: f.title,
                          fontWeight: f.titleWeight,
                          fontSize: `${1.25 * f.titleScale}rem`,
                          textTransform: f.titleUpper ? "uppercase" : undefined,
                          letterSpacing: f.titleUpper ? "0.06em" : undefined,
                        }}
                      >
                        {eventTitle || "Aa"}
                      </span>
                      <span className="block text-xs font-bold mt-1">{t(`invite.fonts.${k}`)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-sm font-bold mb-2">{t("invite.decoration")}</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {ORNAMENT_KEYS.map((k) => {
                  const on = s.invite_design.ornament === k;
                  return (
                    <button key={k} type="button" aria-pressed={on} onClick={() => setDesign({ ornament: k })} className={tile(on)}>
                      <span aria-hidden className="flex h-8 items-center justify-center text-accent">
                        {k === "none" ? <span className="text-xs">—</span> : <InviteOrnament kind={k} className="w-24 h-auto" />}
                      </span>
                      <span className="block text-xs font-bold text-center mt-1">{t(`invite.ornaments.${k}`)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <ToggleRow
              label={t("invite.frame")}
              hint={t("invite.frameHint")}
              checked={s.invite_design.frame}
              onChange={(v) => setDesign({ frame: v })}
            />
          </TabsContent>

          <TabsContent value="look" className="space-y-5 pt-4">
            <div>
              <p className="text-sm font-bold mb-2">{t("invite.layout")}</p>
              <div className="grid grid-cols-2 gap-2">
                {(["card", "photo"] as const).map((l) => {
                  const on = l === "photo" ? s.invite_style === "photo" : s.invite_style !== "photo";
                  return (
                    <button
                      key={l}
                      type="button"
                      onClick={() => set("invite_style", l === "photo" ? "photo" : "classic")}
                      className={tile(on)}
                      aria-pressed={on}
                    >
                      <span className="block text-sm font-bold">{t(`invite.layouts.${l}`)}</span>
                      <span className="block text-xs">{t(`invite.layoutHints.${l}`)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-sm font-bold mb-2">{t("invite.cover")}</p>
              {s.invite_cover_url ? (
                <div className="relative">
                  <img src={s.invite_cover_url} alt="" className="w-full aspect-[3/2] max-h-56 object-cover rounded-xl" />
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

        {/* Pinned to the bottom of the window so Save is always in reach, on every screen size. */}
        <div className="sticky -bottom-6 z-10 -mx-6 -mb-6 mt-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-border bg-card px-6 pt-4 pb-6">
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

// A small live copy of the top of the invitation, drawn with the same
// header as the guest page. Pinned while the host scrolls the choices
// (from tablet width up; on phones it scrolls away to leave room).
function DesignPreview({ s, title, invitedLabel }: { s: InvitationSettings; title: string; invitedLabel: string }) {
  const d = s.invite_design;
  return (
    <div className="sm:sticky sm:-top-6 z-10 -mx-6 px-6 pb-3 pt-1 bg-card">
      <div
        className="rounded-2xl border border-border p-4 max-h-72 overflow-hidden"
        style={{ ...designVars(d), ...bodyStyle(d) }}
      >
        <InviteHeader
          design={d}
          title={title}
          invitedLabel={invitedLabel}
          coverUrl={s.invite_cover_url}
          photo={s.invite_style === "photo"}
          message={s.invite_message}
          compact
        />
      </div>
    </div>
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
