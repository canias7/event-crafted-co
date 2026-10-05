// Verification — web twin of the app's More → Verification flow.
// Pro/Premium vendors submit ONE account-level request (legal identity
// + government ID + business info + proof documents); admins review in
// the admin panel; approval stamps the public verified badge. Same
// backend as the app: vendor_verification_requests + the private
// vendor-verifications bucket (user-keyed folders, owner+admin only).

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
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
  const { t } = useTranslation("vendorVerification");
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
      toast.error(t("toast.namesRequired"));
      return;
    }
    if (!idFront && !request) {
      toast.error(t("toast.idRequired"));
      return;
    }
    if (docs.length === 0 && existingDocs.length === 0) {
      toast.error(t("toast.docRequired"));
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
      toast.success(t("toast.submitted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toast.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  const showForm = eligible && (!request || editing);

  return (
    <div className="min-h-screen flex relative bg-[var(--vendor-canvas)]">
      <DashboardSidebar items={navItems} title={t("sidebarTitle")} backPath="/" />
      <main className="flex-1 min-w-0 pb-24 lg:pb-0">
        <div
          className="px-5 md:px-8 pt-8 pb-6"
          style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}
        >
          <h1 className="text-3xl md:text-4xl tracking-tight">
            {t("title")} <span className="text-accent">✦</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("subtitle")}
          </p>
        </div>

        <div className="p-4 md:p-8 max-w-[760px] space-y-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground pt-4">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("loading")}
            </div>
          ) : !eligible && !request ? (
            <div className="card-soft p-8 text-center">
              <ShieldCheck className="mx-auto h-8 w-8 text-accent" />
              <h2 className="font-editorial text-3xl mt-4">{t("gate.title")}</h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground leading-relaxed">
                {t("gate.body")}
              </p>
              <Link
                to="/vendor/subscription"
                className="inline-flex justify-center items-center mt-6 rounded-full bg-gold px-6 text-sm font-bold text-foreground hover:bg-gold-hover h-11"
              >
                {t("gate.cta")}
              </Link>
            </div>
          ) : request && !editing ? (
            <StatusCard request={request} onEdit={() => setEditing(true)} />
          ) : showForm ? (
            <form onSubmit={submit} className="space-y-5">
              <section className="card-soft p-6">
                <p className="font-label text-accent mb-1">{t("identity.title")}</p>
                <p className="text-[12.5px] text-muted-foreground mb-4">
                  {t("identity.hint")}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("identity.firstName")} required>
                    <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} placeholder={t("identity.firstNamePlaceholder")} />
                  </Field>
                  <Field label={t("identity.lastName")} required>
                    <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} placeholder={t("identity.lastNamePlaceholder")} />
                  </Field>
                </div>
                <div className="mt-3">
                  <Field label={t("identity.dob")}>
                    <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={inputCls} />
                  </Field>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <FileTile
                    label={t("identity.idFront")}
                    required={!request}
                    file={idFront}
                    onFile={setIdFront}
                    existing={existingIdFront ? t("identity.idFrontOnFile") : null}
                  />
                  <FileTile label={t("identity.idBack")} file={idBack} onFile={setIdBack} />
                </div>
              </section>

              <section className="card-soft p-6">
                <p className="font-label text-accent mb-4">{t("business.title")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("business.name")} required>
                    <input value={bizName} onChange={(e) => setBizName(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label={t("business.category")}>
                    <input value={bizCategory} onChange={(e) => setBizCategory(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label={t("business.email")}>
                    <input type="email" value={bizEmail} onChange={(e) => setBizEmail(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label={t("business.phone")}>
                    <input value={bizPhone} onChange={(e) => setBizPhone(e.target.value)} className={inputCls} />
                  </Field>
                </div>
                <div className="mt-3 grid gap-3">
                  <Field label={t("business.address")}>
                    <input value={bizAddress} onChange={(e) => setBizAddress(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label={t("business.website")}>
                    <input value={website} onChange={(e) => setWebsite(e.target.value)} className={inputCls} placeholder={t("business.websitePlaceholder")} />
                  </Field>
                </div>
                <div className="mt-4">
                  <p className="text-[13px] font-medium">{t("business.proofTitle")}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {t("business.proofHint")}
                  </p>
                  {existingDocs.length > 0 ? (
                    <p className="mt-2 text-[12px] text-muted-foreground">
                      {t("business.onFile", { names: existingDocs.map((d) => d.name).join(", ") })}
                    </p>
                  ) : null}
                  <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-accent/60 bg-accent/5 px-4 py-3 text-sm font-medium hover:bg-accent/10 transition-colors">
                    <FileUp className="h-4 w-4 text-accent" />
                    {docs.length > 0
                      ? docs.map((d) => d.name).join(", ")
                      : t("business.addDocuments")}
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
                <Trans
                  i18nKey="next"
                  ns="vendorVerification"
                  components={{ strong: <strong className="text-foreground" /> }}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex justify-center items-center w-full rounded-full bg-gold text-[15px] font-bold text-foreground hover:bg-gold-hover transition-colors disabled:bg-gold-muted h-[52px]"
              >
                {submitting ? t("submitting") : t("submit")}
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
  const { t } = useTranslation("vendorVerification");
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-accent/60 bg-accent/5 px-4 py-3 hover:bg-accent/10 transition-colors">
      <FileUp className="h-4 w-4 shrink-0 text-accent" />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">
          {label}
          {required ? <span className="text-accent"> *</span> : null}
        </span>
        <span className="block truncate text-[11.5px] text-muted-foreground">
          {file ? file.name : existing ?? t("identity.fileTypes")}
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
  const { t } = useTranslation("vendorVerification");
  const s = request.status;
  const Icon = s === "approved" ? BadgeCheck : s === "needs_info" ? TriangleAlert : Clock;
  const title =
    s === "approved"
      ? t("status.approvedTitle")
      : s === "needs_info"
        ? t("status.needsInfoTitle")
        : s === "rejected"
          ? t("status.rejectedTitle")
          : t("status.reviewTitle");
  const body =
    s === "approved"
      ? t("status.approvedBody")
      : s === "needs_info"
        ? request.admin_note
          ? t("status.teamSays", { note: request.admin_note })
          : t("status.needsInfoBody")
        : s === "rejected"
          ? request.admin_note ?? t("status.rejectedBody")
          : t("status.reviewBody");
  return (
    <div className="card-soft p-8 text-center">
      <Icon
        className={`mx-auto h-9 w-9 ${
          s === "approved" ? "text-foreground" : s === "needs_info" ? "text-destructive" : "text-accent"
        }`}
      />
      <h2 className="font-editorial text-3xl mt-4">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground leading-relaxed">{body}</p>
      {s === "approved" ? (
        <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent/10 border border-accent/30 px-4 py-1.5 text-[13px] font-semibold text-accent">
          <ShieldCheck className="h-4 w-4" /> {t("status.verifiedVendor")}
        </span>
      ) : null}
      {s === "needs_info" || s === "rejected" ? (
        <button
          onClick={onEdit}
          className="inline-flex justify-center items-center mt-6 rounded-full bg-gold px-6 text-sm font-bold text-foreground hover:bg-gold-hover h-11"
        >
          {t("status.resubmit")}
        </button>
      ) : null}
    </div>
  );
}
