import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2, Upload, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { vendorImageUrl } from "@/lib/storage";

// Vendor-side editor for the public Team section. CRUD over the
// vendor_team_bios table, with optional face photos uploaded into
// the existing vendor-portfolios bucket under a per-vendor /team/
// sub-folder. RLS limits writes to the vendor's own row.

const BUCKET = "vendor-portfolios";
const MAX_PHOTO_BYTES = 3 * 1024 * 1024; // 3 MB
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

interface TeamMember {
  id: string;
  display_name: string;
  role: string | null;
  bio: string | null;
  photo_storage_path: string | null;
  is_owner: boolean;
  display_order: number;
}

interface DraftMember {
  id?: string;
  display_name: string;
  role: string;
  bio: string;
  photo_storage_path: string | null;
  is_owner: boolean;
}

const EMPTY_DRAFT: DraftMember = {
  display_name: "",
  role: "",
  bio: "",
  photo_storage_path: null,
  is_owner: false,
};

// `vendor_team_bios` is brand new in this PR — the generated
// Supabase types aren't regenerated until the migration applies, so
// route every call through (supabase as any) to keep the build green.
// Once types catch up, drop these casts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const teamTable = () => (supabase as any).from("vendor_team_bios");

export function VendorTeamManager({ vendorId }: { vendorId: string }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<DraftMember>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await teamTable()
      .select("id, display_name, role, bio, photo_storage_path, is_owner, display_order")
      .eq("vendor_id", vendorId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      toast.error(`Couldn't load team: ${error.message}`);
      setMembers([]);
    } else {
      setMembers((data as TeamMember[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (vendorId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  function startAdd() {
    setDraft(EMPTY_DRAFT);
    setEditingId("new");
  }

  function startEdit(m: TeamMember) {
    setDraft({
      id: m.id,
      display_name: m.display_name,
      role: m.role ?? "",
      bio: m.bio ?? "",
      photo_storage_path: m.photo_storage_path,
      is_owner: m.is_owner,
    });
    setEditingId(m.id);
  }

  function cancel() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  }

  async function uploadPhoto(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Photo must be JPG, PNG, or WEBP");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error("Photo must be under 3 MB");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${vendorId}/team/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: "3600" });
    setUploading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDraft((d) => ({ ...d, photo_storage_path: path }));
  }

  async function save() {
    if (!draft.display_name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    const payload = {
      vendor_id: vendorId,
      display_name: draft.display_name.trim(),
      role: draft.role.trim() || null,
      bio: draft.bio.trim() || null,
      photo_storage_path: draft.photo_storage_path,
      is_owner: draft.is_owner,
    };
    if (draft.id) {
      const { error } = await teamTable()
        .update(payload)
        .eq("id", draft.id);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
    } else {
      const order =
        members.reduce((m, x) => Math.max(m, x.display_order), -1) + 1;
      const { error } = await teamTable().insert({
        ...payload,
        display_order: order,
      });
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    toast.success(draft.id ? "Team member updated" : "Team member added");
    load();
  }

  async function remove(m: TeamMember) {
    if (!confirm(`Remove ${m.display_name} from the team?`)) return;
    if (m.photo_storage_path) {
      // Best-effort blob cleanup; even on failure the row is gone so
      // the photo just becomes orphaned (storage policies still scope
      // it to this vendor).
      await supabase.storage.from(BUCKET).remove([m.photo_storage_path]);
    }
    const { error } = await teamTable().delete().eq("id", m.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${m.display_name} removed`);
    setMembers((prev) => prev.filter((x) => x.id !== m.id));
  }

  if (loading) {
    return <p className="text-xs text-muted-foreground py-3">Loading team…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-label text-muted-foreground">Team members</p>
          <p className="text-xs text-muted-foreground mt-1">
            Owner + everyone clients should know — face photos are optional.
          </p>
        </div>
        {editingId !== "new" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={startAdd}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add member
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {members.length === 0 && editingId !== "new" ? (
          <p className="text-xs text-muted-foreground italic py-3">
            No team members yet — add yourself first.
          </p>
        ) : null}

        {members.map((m) =>
          editingId === m.id ? (
            <DraftCard
              key={m.id}
              draft={draft}
              setDraft={setDraft}
              saving={saving}
              uploading={uploading}
              onSave={save}
              onCancel={cancel}
              onUploadFile={(f) => uploadPhoto(f)}
              fileInputRef={fileInputRef}
            />
          ) : (
            <MemberCard
              key={m.id}
              member={m}
              onEdit={() => startEdit(m)}
              onDelete={() => remove(m)}
            />
          ),
        )}

        {editingId === "new" && (
          <DraftCard
            draft={draft}
            setDraft={setDraft}
            saving={saving}
            uploading={uploading}
            onSave={save}
            onCancel={cancel}
            onUploadFile={(f) => uploadPhoto(f)}
            fileInputRef={fileInputRef}
          />
        )}
      </div>
    </div>
  );
}

function MemberCard({
  member,
  onEdit,
  onDelete,
}: {
  member: TeamMember;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-sm border border-border bg-card p-3">
      <PhotoThumb path={member.photo_storage_path} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-sm truncate">{member.display_name}</p>
          {member.is_owner && (
            <span className="text-[10px] uppercase tracking-wide bg-accent/15 text-accent rounded-full px-1.5 py-0.5">
              Owner
            </span>
          )}
        </div>
        {member.role && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {member.role}
          </p>
        )}
        {member.bio && (
          <p className="text-xs text-foreground/70 mt-1.5 line-clamp-2">
            {member.bio}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onEdit}
        >
          Edit
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

function DraftCard({
  draft,
  setDraft,
  saving,
  uploading,
  onSave,
  onCancel,
  onUploadFile,
  fileInputRef,
}: {
  draft: DraftMember;
  setDraft: React.Dispatch<React.SetStateAction<DraftMember>>;
  saving: boolean;
  uploading: boolean;
  onSave: () => void;
  onCancel: () => void;
  onUploadFile: (f: File) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="rounded-sm border border-accent/40 bg-accent/5 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0 group relative"
          disabled={uploading}
          aria-label="Upload photo"
        >
          <PhotoThumb path={draft.photo_storage_path} />
          <span className="absolute inset-0 rounded-sm bg-foreground/0 group-hover:bg-foreground/40 transition-colors flex items-center justify-center text-background opacity-0 group-hover:opacity-100">
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUploadFile(f);
            e.target.value = "";
          }}
        />
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="tm-name" className="text-xs">Name</Label>
            <Input
              id="tm-name"
              value={draft.display_name}
              onChange={(e) =>
                setDraft((d) => ({ ...d, display_name: e.target.value }))
              }
              placeholder="Full name"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tm-role" className="text-xs">Role</Label>
            <Input
              id="tm-role"
              value={draft.role}
              onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
              placeholder="Founder · Lead Photographer · etc."
              className="h-9"
            />
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tm-bio" className="text-xs">Short bio (optional)</Label>
        <Textarea
          id="tm-bio"
          value={draft.bio}
          onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))}
          placeholder="A sentence or two — background, what they specialize in."
          rows={2}
          className="text-sm"
        />
      </div>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <Switch
            checked={draft.is_owner}
            onCheckedChange={(v) =>
              setDraft((d) => ({ ...d, is_owner: v === true }))
            }
          />
          Owner / founder
        </label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={saving || uploading}
            className="rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function PhotoThumb({ path }: { path: string | null }) {
  if (!path) {
    return (
      <div className="w-14 h-14 rounded-sm bg-muted flex items-center justify-center text-muted-foreground">
        <User className="w-5 h-5" />
      </div>
    );
  }
  return (
    <img
      src={vendorImageUrl(path, { width: 200, height: 200 })}
      alt=""
      className="w-14 h-14 rounded-sm object-cover bg-muted"
    />
  );
}
