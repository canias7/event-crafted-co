// Meet the Team — web twin of the app's More → Meet the Team editor.
// Same backend: profiles.show_team master toggle + vendor_team_profiles
// rows (photo in the public vendor-posts bucket). What vendors publish
// here renders on their public listing via VendorTeamPublic.

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems as navItems } from "@/data/navItems";

interface Member {
  id: string;
  full_name: string;
  role_title: string;
  bio: string | null;
  specialty: string | null;
  years_with_business: string | null;
  fun_fact: string | null;
  link_url: string | null;
  photo_url: string | null;
  visible: boolean;
  display_order: number;
}

const EMPTY = {
  full_name: "",
  role_title: "",
  bio: "",
  specialty: "",
  years_with_business: "",
  fun_fact: "",
  link_url: "",
  visible: true,
};

export default function VendorTeamPage() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [showTeam, setShowTeam] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const [{ data: prof }, { data: rows }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("profiles").select("show_team").eq("id", userId).maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("vendor_team_profiles")
        .select("*")
        .eq("user_id", userId)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);
    setShowTeam(!!(prof as { show_team?: boolean } | null)?.show_team);
    setMembers((rows ?? []) as Member[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleShowTeam(next: boolean) {
    setShowTeam(next);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ show_team: next })
      .eq("id", userId);
    if (error) {
      setShowTeam(!next);
      toast.error(error.message);
    } else {
      toast.success(next ? "Your team section is live." : "Team section hidden.");
    }
  }

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY });
    setPhoto(null);
    setFormOpen(true);
  }

  function openEdit(m: Member) {
    setEditing(m);
    setForm({
      full_name: m.full_name,
      role_title: m.role_title,
      bio: m.bio ?? "",
      specialty: m.specialty ?? "",
      years_with_business: m.years_with_business ?? "",
      fun_fact: m.fun_fact ?? "",
      link_url: m.link_url ?? "",
      visible: m.visible,
    });
    setPhoto(null);
    setFormOpen(true);
  }

  async function saveMember(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || saving) return;
    if (!form.full_name.trim() || !form.role_title.trim() || !form.bio.trim()) {
      toast.error("Name, role, and a short bio are required.");
      return;
    }
    setSaving(true);
    try {
      let photoUrl = editing?.photo_url ?? null;
      if (photo) {
        const path = `${userId}/team-${Date.now()}.jpg`;
        const { error } = await supabase.storage
          .from("vendor-posts")
          .upload(path, photo, { contentType: photo.type || "image/jpeg" });
        if (error) throw new Error(error.message);
        photoUrl = supabase.storage.from("vendor-posts").getPublicUrl(path).data.publicUrl;
      }
      const payload = {
        full_name: form.full_name.trim(),
        role_title: form.role_title.trim(),
        bio: form.bio.trim() || null,
        specialty: form.specialty.trim() || null,
        years_with_business: form.years_with_business.trim() || null,
        fun_fact: form.fun_fact.trim() || null,
        link_url: form.link_url.trim() || null,
        photo_url: photoUrl,
        visible: form.visible,
      };
      const q = editing
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).from("vendor_team_profiles").update(payload).eq("id", editing.id)
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("vendor_team_profiles")
            .insert({ ...payload, user_id: userId, display_order: members.length });
      const { error } = await q;
      if (error) throw new Error(error.message);
      setFormOpen(false);
      await load();
      toast.success(editing ? "Member updated." : "Member added.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(m: Member) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("vendor_team_profiles").delete().eq("id", m.id);
    void load();
  }

  async function move(m: Member, dir: -1 | 1) {
    const idx = members.findIndex((x) => x.id === m.id);
    const swap = members[idx + dir];
    if (!swap) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("vendor_team_profiles")
        .update({ display_order: swap.display_order })
        .eq("id", m.id),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("vendor_team_profiles")
        .update({ display_order: m.display_order })
        .eq("id", swap.id),
    ]);
    void load();
  }

  return (
    <div className="min-h-screen flex relative bg-[var(--vendor-canvas)]">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />
      <main className="flex-1 min-w-0 pb-24 lg:pb-0">
        <div
          className="px-4 md:px-8 pt-8 pb-6"
          style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}
        >
          <h1 className="text-3xl md:text-4xl tracking-tight">
            Meet the Team <span className="text-accent">✦</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Introduce the people behind your business — optional, and always in your control.
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-[860px] space-y-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pt-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <label className="card-soft flex cursor-pointer items-center justify-between gap-4 p-5">
                <span>
                  <span className="block text-[15px] font-semibold">
                    Show the team on my public profile
                  </span>
                  <span className="block text-[12.5px] text-muted-foreground mt-0.5">
                    When off, nothing is shown publicly — your entries stay saved.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={showTeam}
                  onChange={(e) => void toggleShowTeam(e.target.checked)}
                  className="h-4 w-4"
                />
              </label>

              <div className="space-y-2">
                {members.map((m, i) => (
                  <div
                    key={m.id}
                    className="card-soft flex items-center gap-4 p-4"
                    style={{ opacity: m.visible ? 1 : 0.55 }}
                  >
                    {m.photo_url ? (
                      <img src={m.photo_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted font-editorial not-italic">
                        {m.full_name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <button onClick={() => openEdit(m)} className="min-w-0 flex-1 text-left">
                      <p className="m-0 truncate text-[14.5px] font-semibold">
                        {m.full_name}
                        {!m.visible ? (
                          <span className="text-muted-foreground font-normal"> · hidden</span>
                        ) : null}
                      </p>
                      <p className="m-0 truncate text-[12px] text-accent">{m.role_title}</p>
                    </button>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <IconBtn label="Move up" disabled={i === 0} onClick={() => void move(m, -1)}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn
                        label="Move down"
                        disabled={i === members.length - 1}
                        onClick={() => void move(m, 1)}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn label="Remove" onClick={() => void removeMember(m)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconBtn>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={openNew}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-accent/60 bg-accent/5 py-4 text-sm font-semibold hover:bg-accent/10 transition-colors"
              >
                <Plus className="h-4 w-4 text-accent" /> Add team member
              </button>

              {formOpen ? (
                <form onSubmit={saveMember} className="card-soft space-y-3 p-6">
                  <p className="font-label text-accent">
                    {editing ? "Edit member ✦" : "New member ✦"}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={form.full_name}
                      onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                      placeholder="Full name *"
                      className={inputCls}
                    />
                    <input
                      value={form.role_title}
                      onChange={(e) => setForm((f) => ({ ...f, role_title: e.target.value }))}
                      placeholder="Role — e.g., Lead planner *"
                      className={inputCls}
                    />
                  </div>
                  <textarea
                    value={form.bio}
                    onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value.slice(0, 300) }))}
                    placeholder="Short bio (up to 300 characters) *"
                    rows={3}
                    className={`${inputCls} resize-none`}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={form.specialty}
                      onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))}
                      placeholder="Specialty"
                      className={inputCls}
                    />
                    <input
                      value={form.years_with_business}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, years_with_business: e.target.value }))
                      }
                      placeholder="Years with the business"
                      className={inputCls}
                    />
                    <input
                      value={form.fun_fact}
                      onChange={(e) => setForm((f) => ({ ...f, fun_fact: e.target.value }))}
                      placeholder="Fun fact"
                      className={inputCls}
                    />
                    <input
                      value={form.link_url}
                      onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))}
                      placeholder="Link (portfolio, Instagram…)"
                      className={inputCls}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-accent/60 bg-accent/5 px-4 py-2 text-[13px] font-medium hover:bg-accent/10 transition-colors">
                      <ImagePlus className="h-4 w-4 text-accent" />
                      {photo ? photo.name : editing?.photo_url ? "Replace photo" : "Add photo"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                      />
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                      <input
                        type="checkbox"
                        checked={form.visible}
                        onChange={(e) => setForm((f) => ({ ...f, visible: e.target.checked }))}
                      />
                      Visible on my profile
                    </label>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-full bg-foreground px-6 py-2.5 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
                    >
                      {saving ? "Saving…" : "Save member"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormOpen(false)}
                      className="rounded-full border border-border bg-background px-6 py-2.5 text-sm font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </>
          )}
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

function IconBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-full border border-border bg-background p-2 text-muted-foreground hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  );
}
