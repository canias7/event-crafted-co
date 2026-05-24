// "New listing" wizard. Mirrors the mobile flow in
// apps/vendor-mobile/app/(vendor)/listing.tsx — but without drafts.
// The mobile version creates a draft row first and updates it as the
// user types; the web version keeps every field in memory and INSERTs
// once on submit with application_status='pending'. The admin
// reviews the result and approves it to go public — there's no
// in-between draft state on web.
//
// STEP 2 ("structured details") renders the category schema from
// @vendora/core via the shared CategoryAttributesFields component, so
// the field set and JSONB shape on vendor_profiles.category_attributes
// stay byte-identical to the mobile listing builder.

import { useEffect, useMemo, useRef, useState } from "react";
import { Crown, GripVertical, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CategoryAttributesFields } from "@/components/vendor/CategoryAttributesEditor";
import { CATEGORY_GROUPS } from "@/data/categoryTaxonomy";
import { getCategorySchema } from "@/data/categoryAttributes";
import { supabase } from "@/integrations/supabase/client";
import {
  UploadCancelledError,
  describeRejected,
  uploadListingPhotos,
  validateListingPhotos,
} from "@/lib/listingPhotoUpload";

// Up to 100 photos per listing. Public listing pages render the
// first 6 in the hero grid (cover spans 2×2, 4 thumbs around it,
// 6th fills the corner) and surface the rest in the "All photos"
// modal. Minimum 3 so a fresh listing always has something to show.
const MAX_PHOTOS = 100;
const MIN_PHOTOS = 3;

// localStorage key for the wizard's text-field draft. Scoped by
// user-id so two vendors sharing a browser don't see each other's
// drafts. Photos can't be serialized (File objects don't survive
// JSON.stringify) so we only preserve typed content — picking
// photos is faster than typing 5 FAQ answers, and vendors usually
// pick photos last.
function draftKey(userId: string) {
  return `vendora.listing.draft.v1.${userId}`;
}
interface ListingDraft {
  category: string;
  location: string;
  priceUsd: string;
  attrs: Attrs;
  faqs: FAQDraft[];
  savedAt: number;
}

interface FAQDraft {
  question: string;
  answer: string;
}
type AttrValue = string | number | boolean | string[] | null | undefined;
type Attrs = Record<string, AttrValue>;

export function ListingWizardModal({
  userId,
  onClose,
  onPublished,
}: {
  userId: string;
  onClose: () => void;
  onPublished: () => void;
}) {
  const [photos, setPhotos] = useState<File[]>([]);
  const [category, setCategory] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [priceUsd, setPriceUsd] = useState<string>("");
  const [attrs, setAttrs] = useState<Attrs>({});
  const [faqs, setFaqs] = useState<FAQDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Set true when the modal is being closed mid-upload so the
  // upload helper bails between files and the rollback path
  // removes any partially-committed state.
  const cancelledRef = useRef(false);
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  // Restore the wizard's text-field draft on mount. Photos can't be
  // serialized so they're not preserved — but everything the vendor
  // typed (category, location, price, structured attrs, FAQs) comes
  // back so a closed-tab or accidental-X doesn't burn 10 minutes of
  // form-filling. Single-shot effect; we don't try to keep it
  // synced with manual localStorage edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!userId) return;
    try {
      const raw = localStorage.getItem(draftKey(userId));
      if (!raw) return;
      const draft = JSON.parse(raw) as ListingDraft;
      if (draft.category) setCategory(draft.category);
      if (draft.location) setLocation(draft.location);
      if (draft.priceUsd) setPriceUsd(draft.priceUsd);
      if (draft.attrs && typeof draft.attrs === "object") setAttrs(draft.attrs);
      if (Array.isArray(draft.faqs) && draft.faqs.length > 0) setFaqs(draft.faqs);
      const ageMin = Math.round((Date.now() - (draft.savedAt ?? 0)) / 60000);
      toast(
        ageMin < 60
          ? "Restored your draft from earlier."
          : `Restored your draft from ${Math.round(ageMin / 60)}h ago.`,
      );
    } catch {
      // Ignore corrupt drafts — fall through to a fresh form.
    }
  }, []);

  // Auto-save the draft on every text-field change. Photos still
  // live in component memory only. Clearing the draft happens in
  // handleSubmit after a successful insert (so re-opening the
  // wizard after a finished submission starts fresh).
  useEffect(() => {
    if (!userId) return;
    const hasContent =
      !!category ||
      !!location.trim() ||
      !!priceUsd.trim() ||
      Object.keys(attrs).length > 0 ||
      faqs.length > 0;
    const key = draftKey(userId);
    if (!hasContent) {
      localStorage.removeItem(key);
      return;
    }
    const draft: ListingDraft = {
      category,
      location,
      priceUsd,
      attrs,
      faqs,
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      // localStorage full / private mode — silently skip.
    }
  }, [userId, category, location, priceUsd, attrs, faqs]);

  function attemptClose() {
    if (submitting) {
      if (
        !window.confirm(
          "Photos are still uploading. Cancel and discard this listing?",
        )
      ) {
        return;
      }
      cancelledRef.current = true;
    }
    onClose();
  }

  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setPhotos((prev) => {
      const fromIdx = Number(String(active.id).replace("photo-", ""));
      const toIdx = Number(String(over.id).replace("photo-", ""));
      if (Number.isNaN(fromIdx) || Number.isNaN(toIdx)) return prev;
      return arrayMove(prev, fromIdx, toIdx);
    });
  }

  const hasDetailsSchema = useMemo(
    () => (category ? getCategorySchema(category) !== null : false),
    [category],
  );

  const trimmedLocation = location.trim();
  const priceNum = Number(priceUsd);
  const priceCents = Number.isFinite(priceNum) ? Math.round(priceNum * 100) : 0;

  // Hard-block publish: ≥3 photos, category, location, price > 0.
  // FAQs are optional but any added row must be filled (otherwise we'd
  // INSERT empty rows).
  const validation = useMemo(() => {
    const errs: string[] = [];
    if (photos.length < MIN_PHOTOS)
      errs.push(
        `Add ${MIN_PHOTOS - photos.length} more photo${
          MIN_PHOTOS - photos.length === 1 ? "" : "s"
        } (${MIN_PHOTOS}–${MAX_PHOTOS} total).`,
      );
    if (!category) errs.push("Pick a category.");
    if (!trimmedLocation) errs.push("Add a city + state.");
    if (priceCents <= 0) errs.push("Set a price.");
    if (faqs.some((f) => !f.question.trim() || !f.answer.trim()))
      errs.push("Every FAQ needs both a question and an answer.");
    return errs;
  }, [photos.length, category, trimmedLocation, priceCents, faqs]);

  const canSubmit = validation.length === 0 && !submitting;

  function onPickFiles(files: FileList | null) {
    if (!files) return;
    const incoming = Array.from(files);
    const { accepted, rejected } = validateListingPhotos(
      incoming,
      photos.length,
      MAX_PHOTOS,
    );
    if (accepted.length > 0) {
      setPhotos((prev) => [...prev, ...accepted].slice(0, MAX_PHOTOS));
    }
    const skip = describeRejected(rejected);
    if (skip) toast.warning(skip);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    // Track resources allocated mid-flight so we can roll back if a
    // later step fails. Without this, a network blip after the listing
    // row + some photos went in left orphan rows + orphan storage
    // files behind, and retry would just stack more duplicates.
    let createdVendorId: string | null = null;
    const uploadedPaths: string[] = [];
    try {
      // 1. Insert the listing row. The vendor_profiles_add_owner trigger
      //    backfills vendor_team_members so subsequent uploads pass
      //    the is_vendor_member() storage check.
      const { data: vp, error: vpErr } = await supabase
        .from("vendor_profiles")
        .insert({
          user_id: userId,
          category,
          location: trimmedLocation,
          base_price_cents: priceCents,
          category_attributes: attrs,
          application_status: "pending",
        })
        .select("id")
        .single();
      if (vpErr || !vp?.id) {
        throw vpErr ?? new Error("Couldn't create listing");
      }
      const vendorId = vp.id as string;
      createdVendorId = vendorId;

      // 2. Upload portfolio photos to the {vendor_id}/... path the
      //    storage policy requires. Parallel-with-concurrency-cap
      //    cuts a 100-photo upload from ~8 minutes to ~10 seconds.
      setUploadProgress({ done: 0, total: photos.length });
      const upload = await uploadListingPhotos(
        vendorId,
        photos,
        0,
        (p) => setUploadProgress(p),
        () => cancelledRef.current,
      );
      uploadedPaths.push(...upload.paths);
      const portfolio = upload.results.map((r) => ({
        vendor_id: vendorId,
        storage_path: r.storagePath,
        display_order: r.index,
      }));
      const { error: imgErr } = await supabase
        .from("vendor_portfolio_images")
        .insert(portfolio);
      if (imgErr) throw imgErr;

      // 3. Optional FAQs.
      if (faqs.length > 0) {
        const { error } = await supabase.from("vendor_faqs").insert(
          faqs.map((f, i) => ({
            vendor_id: vendorId,
            question: f.question.trim(),
            answer: f.answer.trim(),
            display_order: i,
          })),
        );
        if (error) throw error;
      }

      // 4. Notify admin (fire-and-forget — the listing exists either way).
      void supabase.functions
        .invoke("send-transactional-email", {
          body: { kind: "listing_submitted", vendorProfileId: vendorId },
        })
        .catch(() => undefined);

      // 5. Geocode the listing's location in the background so map /
      //    distance features have coordinates. Best-effort.
      void supabase.functions
        .invoke("geocode-vendor", { body: { vendorId } })
        .catch(() => undefined);

      // Draft served its purpose — clear so the next New Listing
      // open starts fresh instead of restoring this listing's
      // already-saved fields.
      try {
        localStorage.removeItem(draftKey(userId));
      } catch {
        // ignore localStorage failures
      }

      toast.success("Listing submitted for review.");
      onPublished();
    } catch (err) {
      const cancelled = err instanceof UploadCancelledError;
      const msg = (err as { message?: string })?.message ?? "Try again.";
      // Rollback any partial state so retry starts from a clean slate
      // instead of stacking duplicates. Deleting the vendor_profile
      // cascades vendor_portfolio_images + vendor_faqs (verified in DB
      // schema); storage doesn't cascade so we remove paths explicitly.
      // Failures here are non-fatal — log so they'd surface in Sentry
      // but don't drown the original "submit failed" toast.
      if (createdVendorId) {
        const { error: delErr } = await supabase
          .from("vendor_profiles")
          .delete()
          .eq("id", createdVendorId);
        if (delErr) {
          console.error(
            "[ListingWizard] rollback delete vendor_profile failed",
            createdVendorId,
            delErr.message,
          );
        }
      }
      if (uploadedPaths.length > 0) {
        const { error: rmErr } = await supabase.storage
          .from("vendor-portfolios")
          .remove(uploadedPaths);
        if (rmErr) {
          console.error(
            "[ListingWizard] rollback remove storage paths failed",
            uploadedPaths,
            rmErr.message,
          );
        }
      }
      if (cancelled) {
        toast("Upload cancelled — nothing saved.");
      } else {
        toast.error(`Submit failed: ${msg}`);
      }
      setSubmitting(false);
      setUploadProgress(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col vendor-canvas">
      <header className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <button
          onClick={attemptClose}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="text-center">
          <h2 className="font-editorial text-xl italic">New listing</h2>
        </div>
        <div className="w-7" />
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-5 py-8 space-y-12">
          {/* STEP 1 — IDENTITY */}
          <section>
            <StepLabel n={1} kind="IDENTITY" />
            <h3 className="font-editorial text-4xl mt-3">Introduce yourself.</h3>
            <p className="mt-2 text-muted-foreground italic">
              Photos and a few sentences are usually enough to make a host
              stop scrolling.
            </p>

            <div className="mt-6">
              <Label className="font-semibold">Listing photos</Label>
              <p className="text-sm text-muted-foreground italic mb-3">
                {MIN_PHOTOS}&ndash;{MAX_PHOTOS} photos. Your first becomes the cover.
              </p>

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  onPickFiles(e.target.files);
                  e.target.value = "";
                }}
              />

              <DndContext
                sensors={dragSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={photos.map((_, i) => `photo-${i}`)}
                  strategy={rectSortingStrategy}
                >
                  <div className="grid grid-cols-3 gap-2">
                    {photos.map((f, i) => (
                      <SortablePhotoTile
                        key={i}
                        id={`photo-${i}`}
                        file={f}
                        isCover={i === 0}
                        onRemove={() =>
                          setPhotos((prev) => prev.filter((_, j) => j !== i))
                        }
                        onMakeCover={
                          i === 0
                            ? undefined
                            : () =>
                                setPhotos((prev) => {
                                  const next = [...prev];
                                  const [moved] = next.splice(i, 1);
                                  next.unshift(moved);
                                  return next;
                                })
                        }
                      />
                    ))}
                    {photos.length < MAX_PHOTOS ? (
                      <button
                        onClick={() => fileRef.current?.click()}
                        className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-border bg-card/40 text-muted-foreground hover:bg-card hover:text-foreground"
                      >
                        <Upload className="h-5 w-5" />
                        <span className="text-xs">
                          {photos.length === 0 ? "Add cover" : "Add photo"}
                        </span>
                      </button>
                    ) : null}
                  </div>
                </SortableContext>
              </DndContext>
              <p className="mt-2 text-xs text-muted-foreground">
                Bright, recent photos work best. Drag tiles to reorder.
              </p>
            </div>

            <h4 className="mt-8 font-editorial text-2xl">The basics</h4>
            <p className="text-sm text-muted-foreground italic">
              Where you work and where you start.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <Label htmlFor="category" className="font-semibold">
                  Category <span className="text-red-500">•</span>
                </Label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Pick a category</option>
                  {CATEGORY_GROUPS.map((g) => (
                    <optgroup key={g.slug} label={g.name}>
                      {g.subs.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="location" className="font-semibold">
                    Location <span className="text-red-500">•</span>
                  </Label>
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="City, State"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="price" className="font-semibold">
                    Price <span className="text-red-500">•</span>
                  </Label>
                  <div className="relative mt-1">
                    <span className="absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                      $
                    </span>
                    <Input
                      id="price"
                      value={priceUsd}
                      onChange={(e) =>
                        setPriceUsd(e.target.value.replace(/[^0-9.]/g, ""))
                      }
                      placeholder="0"
                      inputMode="decimal"
                      className="pl-7"
                    />
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground italic">
                Set your business name + bio once from your profile — they
                sync to every listing automatically.
              </p>
            </div>
          </section>

          {/* STEP 2 — DETAILS */}
          <section>
            <StepLabel n={2} kind="DETAILS" />
            <h3 className="font-editorial text-4xl mt-3">The fine print.</h3>
            <p className="mt-2 text-muted-foreground italic">
              {category
                ? `Structured fields hosts use to filter and compare. Specific to ${category}.`
                : "Pick a category above to unlock structured details."}
            </p>
            {category && hasDetailsSchema ? (
              <div className="mt-6 space-y-6">
                <CategoryAttributesFields
                  category={category}
                  attrs={attrs}
                  onChange={setAttrs}
                />
              </div>
            ) : category && !hasDetailsSchema ? (
              <div className="mt-4 rounded-md border border-dashed border-border bg-card/30 p-6 text-center text-sm text-muted-foreground italic">
                No structured details for {category} yet.
              </div>
            ) : (
              <div className="mt-4 rounded-md border border-dashed border-border bg-card/30 p-6 text-center text-sm text-muted-foreground italic">
                Pick a category above to unlock structured details.
              </div>
            )}
          </section>

          {/* STEP 3 — FAQs */}
          <section>
            <StepLabel n={3} kind="FAQs" />
            <h3 className="font-editorial text-4xl mt-3">Common questions.</h3>
            <p className="mt-2 text-muted-foreground italic">
              Answer the first three or four hosts will ask — saves you
              typing later.
            </p>

            <div className="mt-4 space-y-3">
              {faqs.map((f, i) => (
                <div
                  key={i}
                  className="rounded-md border border-border bg-card/40 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      FAQ {i + 1}
                    </p>
                    <button
                      onClick={() =>
                        setFaqs((prev) => prev.filter((_, j) => j !== i))
                      }
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Remove FAQ"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <Input
                    value={f.question}
                    onChange={(e) =>
                      setFaqs((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, question: e.target.value } : x,
                        ),
                      )
                    }
                    placeholder="Question"
                    className="mt-3"
                  />
                  <Textarea
                    value={f.answer}
                    onChange={(e) =>
                      setFaqs((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, answer: e.target.value } : x,
                        ),
                      )
                    }
                    placeholder="Answer"
                    rows={2}
                    className="mt-2 resize-none"
                  />
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() =>
                  setFaqs((prev) => [...prev, { question: "", answer: "" }])
                }
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add FAQ
              </Button>
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-2xl flex items-center justify-between gap-3 px-5 py-4">
          <div className="flex-1 text-xs text-muted-foreground">
            {validation.length > 0 ? (
              <span>{validation[0]}</span>
            ) : (
              <span>
                Submitting sends this to review. Once approved, it goes
                public — no further edits.
              </span>
            )}
          </div>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                {uploadProgress && uploadProgress.total > 0
                  ? `Uploading ${uploadProgress.done}/${uploadProgress.total}…`
                  : "Submitting…"}
              </>
            ) : (
              "Submit for review"
            )}
          </Button>
        </div>
      </footer>
    </div>
  );
}

function StepLabel({ n, kind }: { n: number; kind: string }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
      Step {n} · {kind}
    </p>
  );
}

function SortablePhotoTile(props: {
  id: string;
  file: File;
  isCover: boolean;
  onRemove: () => void;
  onMakeCover?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : "auto",
        opacity: isDragging ? 0.8 : 1,
      }}
    >
      <PhotoTile {...props} dragHandle={{ attributes, listeners }} />
    </div>
  );
}

function PhotoTile({
  file,
  isCover,
  onRemove,
  onMakeCover,
  dragHandle,
}: {
  file: File;
  isCover: boolean;
  onRemove: () => void;
  onMakeCover?: () => void;
  dragHandle?: { attributes: Record<string, unknown>; listeners: Record<string, unknown> };
}) {
  // Revoke the object URL on unmount / file change. The previous
  // useMemo created the URL once and held it forever — with 100
  // photos at ~3 MB each, that pinned ~300 MB of blob data in the
  // tab until navigation. createObjectURL allocates real memory;
  // useEffect cleanup is the only correct way to release it.
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return (
    <div className="relative aspect-square overflow-hidden rounded-md bg-secondary/40 group">
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover pointer-events-none select-none"
      />
      {isCover ? (
        <span className="absolute left-1 top-1 rounded-full bg-foreground/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-background">
          Cover
        </span>
      ) : null}
      {dragHandle ? (
        <button
          type="button"
          {...dragHandle.attributes}
          {...dragHandle.listeners}
          className="absolute left-1 bottom-1 inline-flex items-center justify-center w-6 h-6 rounded-full bg-black/55 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <button
        onClick={onRemove}
        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
        aria-label="Remove photo"
      >
        <X className="h-3 w-3" />
      </button>
      {onMakeCover ? (
        <button
          type="button"
          onClick={onMakeCover}
          className="absolute right-1 bottom-1 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
          aria-label="Make cover photo"
        >
          <Crown className="h-2.5 w-2.5" />
          Cover
        </button>
      ) : null}
    </div>
  );
}
