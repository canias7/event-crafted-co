// Verification — web twin of the app's More → Verification flow.
// Pro/Premium vendors submit ONE account-level request (legal identity
// + government ID + business info + proof documents); admins review in
// the admin panel; approval stamps the public verified badge. Same
// backend as the app: vendor_verification_requests + the private
// vendor-verifications bucket (user-keyed folders, owner+admin only).

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, Clock, FileUp, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { vendorNavItems as navItems } from "@/data/navItems";

interface RequestRow {
  id: string;
  status: "under_review" | "approved" | "needs_info" | "rejected";
  legal_first_name: string;
  legal_last_name: string;
  dob: string | null;
  business_name: string;
  business_category: string | null;
  business_email: string | null;
  business_phone: string | null;
  business_address: string | null;
  website: string | null;
  documents: { name: string; path: string }[];
  admin_note: string | null;
  submitted_at: string;
}

export default function VendorVerificationPage() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [eligible, setEligible] = useState(false);
  const [request, setRequest] = useState<RequestRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // identity
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [idFront, setIdFront] = useState<File | null>(null);
  const [idBack, setIdBack] = useState<File | null>(null);
  const [existingIdFront, setExistingIdFront] = useState<string | null>(null);

  // business
  const [bizName, setBizName] = useState("");
  const [bizCategory, setBizCategory] = useState("");
  const [bizEmail, setBizEmail] = useState("");
  const [bizPhone, setBizPhone] = useState("");
  const [bizAddress, setBizAddress] = useState("");
  const [website, setWebsite] = useState("");
  const [docs, setDocs] = useState<File[]>([]);
  const [existingDocs, setExistingDocs] = useState<{ name: string; path: string }[]>([]);

  const load = useCallback(async () => {
    if (!userId) return;
    const [{ data: prof }, { data: req }, { data: listing }] = await Promise.all([
      supabase
        .from("profiles")
        .select("subscription_tier, unlimited_listings")
        .eq("id", userId)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("vendor_verification_requests")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("vendor_profiles")
        .select("business_name, category, location")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    const p = prof as { subscription_tier?: string; unlimited_listings?: boolean } | null;
    const tier = p?.subscription_tier ?? "free";
    setEligible(tier === "pro" || tier === "studio" || !!p?.unlimited_listings);
    const r = req as RequestRow | null;
    setRequest(r);
    if (r) {
      setFirstName(r.legal_first_name);
      setLastName(r.legal_last_name);
      setDob(r.dob ?? "");
      setBizName(r.business_name);
      setBizCategory(r.business_category ?? "");
      setBizEmail(r.business_email ?? "");
      setBizPhone(r.business_phone ?? "");
      setBizAddress(r.business_address ?? "");
      setWebsite(r.website ?? "");
      setExistingDocs(r.documents ?? []);
      setExistingIdFront("on-file");
    } else {
      const l = listing as { business_name?: string; category?: string; location?: string } | null;
      if (l) {
        setBizName((c) => c || l.business_name || "");
        setBizCategory((c) => c || l.category || "");
        setBizAddress((c) => c || l.location || "");
      }
      setBizEmail((c) => c || session?.user?.email || "");
    }
    setLoading(false);
  }, [userId, session?.user?.email]);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadFile(file: File, slug: string): Promise<string> {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${userId}/${slug}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("vendor-verifications")
      .upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (error) throw new Error(error.message);
    return path;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || submitting) return;
    if (!firstName.trim() || !lastName.trim() || !bizName.trim()) {
      toast.error("Legal name and business name are required.");
      return;
    }
    if (!idFront && !request) {
      toast.error("A photo of the front of your government ID is required.");
      return;
    }
    if (docs.length === 0 && existingDocs.length === 0) {
      toast.error("Add at least one proof document — insurance, license, or registration.");
      return;
    }
    setSubmitting(true);
    try {
      const idFrontPath = idFront
        ? await uploadFile(idFront, "id-front")
        : undefined;
      const idBackPath = idBack ? await uploadFile(idBack, "id-back") : undefined;
      const newDocPaths: { name: string; path: string }[] = [];
      for (const f of docs) {
        newDocPaths.push({ name: f.name, path: await uploadFile(f, "doc") });
      }
      const payload: Record<string, unknown> = {
        status: "under_review",
        legal_first_name: firstName.trim(),
        legal_last_name: lastName.trim(),
        dob: dob || null,
        business_name: bizName.trim(),
        business_category: bizCategory.trim() || null,
        business_email: bizEmail.trim() || null,
        business_phone: bizPhone.trim() || null,
        business_address: bizAddress.trim() || null,
        website: website.trim() || null,
        documents: [...existingDocs, ...newDocPaths],
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (idFrontPath) payload.id_front_path = idFrontPath;
      if (idBackPath) payload.id_back_path = idBackPath;
      const q = request
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("vendor_verification_requests")
            .update(payload)
            .eq("id", request.id)
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("vendor_verification_requests")
            .insert({ ...payload, user_id: userId });
      const { error } = await q;
      if (error) throw new Error(error.message);
      setEditing(false);
      setIdFront(null);
      setIdBack(null);
      setDocs([]);
      await load();
      toast.success("Submitted — we'll review within 1–3 business days.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't submit — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const showForm = eligible && (!request || editing);

  return (
    <div className="min-h-screen flex relative bg-[var(--vendor-canvas)]">
      <DashboardSidebar items={navItems} title="Vendor Portal" backPath="/" />
      <main className="flex-1 min-w-0 pb-24 lg:pb-0">
        <div
          className="px-4 md:px-8 pt-8 pb-6"
          style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}
        >
          <h1 className="text-3xl md:text-4xl tracking-tight">
            Verification <span className="text-accent">✦</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Earn the verified badge — reviewed by a real person, same flow as the app.
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-[760px] space-y-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pt-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : !eligible && !request ? (
            <div className="card-soft p-8 text-center">
              <ShieldCheck className="mx-auto h-8 w-8 text-accent" />
              <h2 className="font-editorial text-3xl mt-4">Get verified. Build trust.</h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground leading-relaxed">
                The verified badge tells hosts a real person and a real business
                are behind your profile. Applying is included with Pro and
                Premium plans — approval is always reviewed by our team.
              </p>
              <Link
                to="/vendor/subscription"
                className="mt-6 inline-block rounded-full bg-foreground px-6 py-2.5 text-sm font-semibold text-background hover:opacity-90"
              >
                ✦ Upgrade to apply
              </Link>
            </div>
          ) : request && !editing ? (
            <StatusCard request={request} onEdit={() => setEditing(true)} />
          ) : showForm ? (
            <form onSubmit={submit} className="space-y-5">
              <section className="card-soft p-6">
                <p className="font-label text-accent mb-1">Identity ✦</p>
                <p className="text-[12.5px] text-muted-foreground mb-4">
                  Your legal details stay private — only used to verify your identity.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Legal first name" required>
                    <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} placeholder="Jessica" />
                  </Field>
                  <Field label="Legal last name" required>
                    <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} placeholder="Brown" />
                  </Field>
                </div>
                <div className="mt-3">
                  <Field label="Date of birth">
                    <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={inputCls} />
                  </Field>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <FileTile
                    label="Front of government ID"
                    required={!request}
                    file={idFront}
                    onFile={setIdFront}
                    existing={existingIdFront ? "On file from your last submission" : null}
                  />
                  <FileTile label="Back of ID (optional)" file={idBack} onFile={setIdBack} />
                </div>
              </section>

              <section className="card-soft p-6">
                <p className="font-label text-accent mb-4">Business ✦</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Business / Display name" required>
                    <input value={bizName} onChange={(e) => setBizName(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Business category">
                    <input value={bizCategory} onChange={(e) => setBizCategory(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Business email">
                    <input type="email" value={bizEmail} onChange={(e) => setBizEmail(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Business phone">
                    <input value={bizPhone} onChange={(e) => setBizPhone(e.target.value)} className={inputCls} />
                  </Field>
                </div>
                <div className="mt-3 grid gap-3">
                  <Field label="Business address or service area">
                    <input value={bizAddress} onChange={(e) => setBizAddress(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Website or social (optional)">
                    <input value={website} onChange={(e) => setWebsite(e.target.value)} className={inputCls} placeholder="www.yourbusiness.com" />
                  </Field>
                </div>
                <div className="mt-4">
                  <p className="text-[13px] font-medium">Proof of business</p>
                  <p className="text-[12px] text-muted-foreground">
                    Insurance certificate, business license, or registration — images or PDFs.
                  </p>
                  {existingDocs.length > 0 ? (
                    <p className="mt-2 text-[12px] text-muted-foreground">
                      On file: {existingDocs.map((d) => d.name).join(", ")}
                    </p>
                  ) : null}
                  <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-accent/60 bg-accent/5 px-4 py-3 text-sm font-medium hover:bg-accent/10 transition-colors">
                    <FileUp className="h-4 w-4 text-accent" />
                    {docs.length > 0
                      ? docs.map((d) => d.name).join(", ")
                      : "Add documents"}
                    <input
                      type="file"
                      multiple
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => setDocs(Array.from(e.target.files ?? []).slice(0, 4))}
                    />
                  </label>
                </div>
              </section>

              <div className="card-soft border border-accent/40 bg-accent/5 p-5 text-[13px] leading-relaxed text-muted-foreground">
                <strong className="text-foreground">What happens next?</strong> We'll
                review your information within 1–3 business days. You'll be
                notified in the app and here once a decision has been made. By
                submitting, you agree to Vendora's Terms of Service and Privacy
                Policy.
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full bg-foreground py-3.5 text-[15px] font-semibold text-background hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit for review"}
              </button>
            </form>
          ) : null}
        </div>
      </main>
      <MobileNav items={navItems} />
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium">
        {label}
        {required ? <span className="text-accent"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function FileTile({
  label,
  required,
  file,
  onFile,
  existing,
}: {
  label: string;
  required?: boolean;
  file: File | null;
  onFile: (f: File | null) => void;
  existing?: string | null;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-accent/60 bg-accent/5 px-4 py-3 hover:bg-accent/10 transition-colors">
      <FileUp className="h-4 w-4 shrink-0 text-accent" />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">
          {label}
          {required ? <span className="text-accent"> *</span> : null}
        </span>
        <span className="block truncate text-[11.5px] text-muted-foreground">
          {file ? file.name : existing ?? "JPG, PNG, or PDF"}
        </span>
      </span>
      <input
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}

function StatusCard({ request, onEdit }: { request: RequestRow; onEdit: () => void }) {
  const s = request.status;
  const Icon = s === "approved" ? BadgeCheck : s === "needs_info" ? TriangleAlert : Clock;
  const title =
    s === "approved"
      ? "You're verified!"
      : s === "needs_info"
        ? "We need a little more"
        : s === "rejected"
          ? "Not approved this time"
          : "Under review";
  const body =
    s === "approved"
      ? "Your verified badge is live on your public profile — hosts browsing Vendora see it next to your name."
      : s === "needs_info"
        ? request.admin_note
          ? `Our team says: ${request.admin_note}`
          : "We need additional information before we can approve your request."
        : s === "rejected"
          ? request.admin_note ?? "Reach out to support if you think this was a mistake."
          : "Your request is being reviewed. This usually takes 1–3 business days — we'll notify you the moment a decision is made.";
  return (
    <div className="card-soft p-8 text-center">
      <Icon
        className={`mx-auto h-9 w-9 ${
          s === "approved" ? "text-emerald-600" : s === "needs_info" ? "text-amber-600" : "text-accent"
        }`}
      />
      <h2 className="font-editorial text-3xl mt-4">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground leading-relaxed">{body}</p>
      {s === "approved" ? (
        <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent/10 border border-accent/30 px-4 py-1.5 text-[13px] font-semibold text-accent">
          <ShieldCheck className="h-4 w-4" /> Verified vendor
        </span>
      ) : null}
      {s === "needs_info" || s === "rejected" ? (
        <button
          onClick={onEdit}
          className="mt-6 rounded-full bg-foreground px-6 py-2.5 text-sm font-semibold text-background hover:opacity-90"
        >
          Update & resubmit
        </button>
      ) : null}
    </div>
  );
}
