// Edit-listing modal. Loads an existing vendor_profiles listing plus
// its FAQs and portfolio photos, lets the owner change category,
// location, price, category attributes, photos, and FAQs, and writes
// the changes back. Mirrors the field set of ListingWizardModal (the
// create flow). Edits apply immediately — application_status is left
// untouched, so an already-live listing stays live.

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
import { vendorImageUrl } from "@/lib/storage";
import {
  describeRejected,
  uploadListingPhotos,
  validateListingPhotos,
} from "@/lib/listingPhotoUpload";

const MAX_PHOTOS = 100;
const MIN_PHOTOS = 3;
// Tile-render cap for the photo grid. With 100 photos the modal
// renders 100 img tags + drag handles, which can stutter on lower-
// end hardware (mobile Safari especially). Show 30 by default and
// let the vendor flip to all when they need to reach a deeper tile.
const PHOTO_GRID_CAP = 30;

type AttrValue = string | number | boolean | string[] | null | undefined;
type Attrs = Record<string, AttrValue>;

interface FAQRow {
  id: string | null;
  question: string;
  answer: string;
}

type ExistingPhoto = { kind: "existing"; id: string; path: string; url: string };
type NewPhoto = { kind: "new"; file: File; url: string };
type PhotoItem = ExistingPhoto | NewPhoto;

export function EditListingModal({
  vendorId,
  onClose,
  onSaved,
}: {
  vendorId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [priceUsd, setPriceUsd] = useState("");
  const [attrs, setAttrs] = useState<Attrs>({});
  const [faqs, setFaqs] = useState<FAQRow[]>([]);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [photosExpanded, setPhotosExpanded] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // PointerSensor with a 6px activation distance so the drag gesture
  // doesn't fire on accidental taps — vendors clicking the X to
  // remove a photo were drag-and-dropping it instead before this.
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setPhotos((prev) => {
      const ids = prev.map((p, i) => (p.kind === "existing" ? p.id : `new-${i}`));
      const fromIdx = ids.indexOf(active.id as string);
      const toIdx = ids.indexOf(over.id as string);
      if (fromIdx === -1 || toIdx === -1) return prev;
      return arrayMove(prev, fromIdx, toIdx);
    });
  }

  // Revoke any blob URLs the user uploaded in this session when the
  // modal unmounts. Without this, picking 100 fresh photos and
  // closing the modal leaves ~300 MB of blob data pinned in the tab.
  useEffect(() => {
    return () => {
      photos.forEach((p) => {
        if (p.kind === "new") URL.revokeObjectURL(p.url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Snapshot of what was loaded, used to diff on save (which rows to
  // delete, what display_order new rows should append after).
  const originalPhotosRef = useRef<Array<{ id: string; path: string; order: number }>>([]);
  const originalFaqsRef = useRef<Array<{ id: string; order: number }>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      const [vpRes, faqRes, photoRes] = await Promise.all([
        supabase
          .from("vendor_profiles")
          .select("category, location, base_price_cents, category_attributes")
          .eq("id", vendorId)
          .maybeSingle(),
        supabase
          .from("vendor_faqs")
          .select("id, question, answer, display_order")
          .eq("vendor_id", vendorId)
          .order("display_order", { ascending: true }),
        supabase
          .from("vendor_portfolio_images")
          .select("id, storage_path, display_order, created_at")
          .eq("vendor_id", vendorId)
          .order("display_order", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      if (vpRes.error || !vpRes.data) {
        setLoadError("Couldn't load this listing. Close and try again.");
        setLoading(false);
        return;
      }
      const vp = vpRes.data as {
        category: string | null;
        location: string | null;
        base_price_cents: number | null;
        category_attributes: Attrs | null;
      };
      setCategory(vp.category ?? "");
      setLocation(vp.location ?? "");
      setPriceUsd(
        vp.base_price_cents != null ? String(vp.base_price_cents / 100) : "",
      );
      setAttrs(vp.category_attributes ?? {});

      const faqRows = (faqRes.data ?? []) as Array<{
        id: string;
        question: string;
        answer: string;
        display_order: number;
      }>;
      setFaqs(
        faqRows.map((f) => ({ id: f.id, question: f.question, answer: f.answer })),
      );
      originalFaqsRef.current = faqRows.map((f) => ({
        id: f.id,
        order: f.display_order,
      }));

      const photoRows = (photoRes.data ?? []) as Array<{
        id: string;
        storage_path: string;
        display_order: number;
      }>;
      setPhotos(
        photoRows.map((p) => ({
          kind: "existing",
          id: p.id,
          path: p.storage_path,
          url: vendorImageUrl(p.storage_path),
        })),
      );
      originalPhotosRef.current = photoRows.map((p) => ({
        id: p.id,
        path: p.storage_path,
        order: p.display_order,
      }));

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  const hasDetailsSchema = useMemo(
    () => (category ? getCategorySchema(category) !== null : false),
    [category],
  );

  const trimmedLocation = location.trim();
  const priceNum = Number(priceUsd);
  const priceCents = Number.isFinite(priceNum) ? Math.round(priceNum * 100) : 0;

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

  const canSave = validation.length === 0 && !saving && !loading;

  function onPickFiles(files: FileList | null) {
    if (!files) return;
    const incoming = Array.from(files);
    const { accepted, rejected } = validateListingPhotos(
      incoming,
      photos.length,
      MAX_PHOTOS,
    );
    if (accepted.length > 0) {
      const wrapped: NewPhoto[] = accepted.map((f) => ({
        kind: "new",
        file: f,
        url: URL.createObjectURL(f),
      }));
      setPhotos((prev) => [...prev, ...wrapped].slice(0, MAX_PHOTOS));
    }
    const skip = describeRejected(rejected);
    if (skip) toast.warning(skip);
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    // New storage objects uploaded this run — removed on failure so a
    // partial save doesn't leave orphan files behind.
    const uploadedPaths: string[] = [];
    try {
      // 1. Listing fields.
      const { error: vpErr } = await supabase
        .from("vendor_profiles")
        .update({
          category,
          location: trimmedLocation,
          base_price_cents: priceCents,
          category_attributes: attrs,
        })
        .eq("id", vendorId);
      if (vpErr) throw vpErr;

      // 2. Upload + insert NEW photos FIRST, before any destructive
      //    delete of existing ones. Earlier order was delete-then-
      //    upload; if step 3 (upload) failed, the vendor permanently
      //    lost the deleted photos with no recovery path. This new
      //    order guarantees the vendor's portfolio is never strictly
      //    smaller than what they had at modal open until every new
      //    upload has committed.
      //
      // display_order comes from each photo's FINAL index in the
      // photos[] array — that way 'Make cover' (which moves a tile
      // to index 0) persists correctly even though we don't drag-
      // reorder yet.
      const newPhotosWithFinalIdx = photos
        .map((p, idx) => ({ p, idx }))
        .filter(
          (x): x is { p: NewPhoto; idx: number } => x.p.kind === "new",
        );
      if (newPhotosWithFinalIdx.length > 0) {
        setUploadProgress({ done: 0, total: newPhotosWithFinalIdx.length });
        const upload = await uploadListingPhotos(
          vendorId,
          newPhotosWithFinalIdx.map((x) => x.p.file),
          0,
          (pr) => setUploadProgress(pr),
        );
        uploadedPaths.push(...upload.paths);
        const inserts = upload.results.map((r, i) => ({
          vendor_id: vendorId,
          storage_path: r.storagePath,
          display_order: newPhotosWithFinalIdx[i].idx,
        }));
        const { error: insErr } = await supabase
          .from("vendor_portfolio_images")
          .insert(inserts);
        if (insErr) throw insErr;
      }

      // 2b. Persist reorders on existing photos. 'Make cover' moves
      //     a tile to index 0 in state; without this step the new
      //     order wouldn't survive a save. Only fire an UPDATE on
      //     photos whose display_order actually changed — at 100
      //     photos with a single cover swap we typically touch 2-3
      //     rows, not all 100.
      const reorderUpdates = photos
        .map((p, idx) => ({ p, idx }))
        .filter(
          (x): x is { p: ExistingPhoto; idx: number } =>
            x.p.kind === "existing",
        )
        .filter((x) => {
          const orig = originalPhotosRef.current.find((o) => o.id === x.p.id);
          return orig ? orig.order !== x.idx : false;
        });
      for (const { p, idx } of reorderUpdates) {
        const { error: uErr } = await supabase
          .from("vendor_portfolio_images")
          .update({ display_order: idx })
          .eq("id", p.id);
        if (uErr) throw uErr;
      }

      // 3. NOW delete photos the vendor removed. By this point any
      //    new uploads are safely committed, so even if the delete
      //    fails partway the vendor still has at least their pre-
      //    edit photos plus the new ones — never a strictly-shorter
      //    portfolio. Storage cleanup AFTER the DB delete because
      //    the on-delete trigger handles bucket removal too; the
      //    explicit .remove() is belt-and-braces for legacy rows.
      const keptPhotoIds = new Set(
        photos
          .filter((p): p is ExistingPhoto => p.kind === "existing")
          .map((p) => p.id),
      );
      const removedPhotos = originalPhotosRef.current.filter(
        (o) => !keptPhotoIds.has(o.id),
      );
      if (removedPhotos.length > 0) {
        const { error: delErr } = await supabase
          .from("vendor_portfolio_images")
          .delete()
          .in(
            "id",
            removedPhotos.map((r) => r.id),
          );
        if (delErr) throw delErr;
        await supabase.storage
          .from("vendor-portfolios")
          .remove(removedPhotos.map((r) => r.path));
      }

      // 4. FAQs — delete removed, update kept in place, append new.
      const keptFaqIds = new Set(
        faqs.filter((f) => f.id).map((f) => f.id as string),
      );
      const removedFaqIds = originalFaqsRef.current
        .filter((o) => !keptFaqIds.has(o.id))
        .map((o) => o.id);
      if (removedFaqIds.length > 0) {
        const { error: delErr } = await supabase
          .from("vendor_faqs")
          .delete()
          .in("id", removedFaqIds);
        if (delErr) throw delErr;
      }
      // FAQ writes — updates and inserts run in parallel so a save
      // with 10 FAQs finishes in one round trip instead of 10. Bail
      // on the first error; partial saves are still a possibility
      // since these aren't wrapped in a transaction, but the vendor
      // will see the failure and can retry idempotently.
      let nextFaqOrder =
        originalFaqsRef.current.reduce((m, o) => Math.max(m, o.order), -1) + 1;
      const faqOps: Array<Promise<{ error: unknown }>> = [];
      for (const f of faqs) {
        if (f.id) {
          faqOps.push(
            supabase
              .from("vendor_faqs")
              .update({
                question: f.question.trim(),
                answer: f.answer.trim(),
              })
              .eq("id", f.id),
          );
        } else {
          faqOps.push(
            supabase.from("vendor_faqs").insert({
              vendor_id: vendorId,
              question: f.question.trim(),
              answer: f.answer.trim(),
              display_order: nextFaqOrder,
            }),
          );
          nextFaqOrder++;
        }
      }
      const faqResults = await Promise.all(faqOps);
      const firstFaqErr = faqResults.find((r) => r.error);
      if (firstFaqErr) throw firstFaqErr.error;

      // Refresh geocoding off the (possibly changed) location —
      // best-effort; geocode-vendor no-ops when it is unchanged.
      void supabase.functions
        .invoke("geocode-vendor", { body: { vendorId } })
        .catch(() => undefined);

      toast.success("Listing updated.");
      onSaved();
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Try again.";
      if (uploadedPaths.length > 0) {
        await supabase.storage.from("vendor-portfolios").remove(uploadedPaths);
      }
      toast.error(`Save failed: ${msg}`);
      setSaving(false);
      setUploadProgress(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col vendor-canvas">
      <header className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <button
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="font-editorial text-xl italic">Edit listing</h2>
        <div className="w-7" />
      </header>

      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : loadError ? (
          <div className="mx-auto max-w-2xl px-5 py-16 text-center">
            <p className="text-sm text-muted-foreground">{loadError}</p>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl px-5 py-8 space-y-10">
            {/* PHOTOS */}
            <section>
              <h3 className="font-editorial text-2xl">Listing photos</h3>
              <p className="text-sm text-muted-foreground italic mb-3">
                {MIN_PHOTOS}–{MAX_PHOTOS} photos. Your first is the cover.
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
              {(() => {
                const photoIds = photos.map((p, i) =>
                  p.kind === "existing" ? p.id : `new-${i}`,
                );
                const visibleCount = photosExpanded
                  ? photos.length
                  : Math.min(photos.length, PHOTO_GRID_CAP);
                const visible = photos.slice(0, visibleCount);
                const visibleIds = photoIds.slice(0, visibleCount);
                return (
                  <>
                    <DndContext
                      sensors={dragSensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={visibleIds}
                        strategy={rectSortingStrategy}
                      >
                        <div className="grid grid-cols-3 gap-2">
                          {visible.map((p, i) => (
                            <SortablePhotoTile
                              key={photoIds[i]}
                              id={photoIds[i]}
                              url={p.url}
                              isCover={i === 0}
                              onRemove={() => {
                                if (p.kind === "new") URL.revokeObjectURL(p.url);
                                setPhotos((prev) =>
                                  prev.filter((_, j) => j !== i),
                                );
                              }}
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
                              type="button"
                              onClick={() => fileRef.current?.click()}
                              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-border bg-card/40 text-muted-foreground hover:bg-card hover:text-foreground"
                            >
                              <Upload className="h-5 w-5" />
                              <span className="text-xs">Add photo</span>
                            </button>
                          ) : null}
                        </div>
                      </SortableContext>
                    </DndContext>
                    {photos.length > PHOTO_GRID_CAP ? (
                      <button
                        type="button"
                        onClick={() => setPhotosExpanded((v) => !v)}
                        className="mt-3 text-xs font-medium text-foreground/70 hover:text-foreground"
                      >
                        {photosExpanded
                          ? `Show first ${PHOTO_GRID_CAP}`
                          : `Show all ${photos.length} photos`}
                      </button>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground italic">
                      Drag tiles to reorder. The first photo is your cover.
                    </p>
                  </>
                );
              })()}
            </section>

            {/* BASICS */}
            <section>
              <h3 className="font-editorial text-2xl">The basics</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <Label htmlFor="edit-category" className="font-semibold">
                    Category <span className="text-red-500">•</span>
                  </Label>
                  <select
                    id="edit-category"
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
                    <Label htmlFor="edit-location" className="font-semibold">
                      Location <span className="text-red-500">•</span>
                    </Label>
                    <Input
                      id="edit-location"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="City, State"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-price" className="font-semibold">
                      Price <span className="text-red-500">•</span>
                    </Label>
                    <div className="relative mt-1">
                      <span className="absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                        $
                      </span>
                      <Input
                        id="edit-price"
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
              </div>
            </section>

            {/* DETAILS */}
            <section>
              <h3 className="font-editorial text-2xl">The fine print.</h3>
              <p className="mt-1 text-sm text-muted-foreground italic">
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
              ) : null}
            </section>

            {/* FAQs */}
            <section>
              <h3 className="font-editorial text-2xl">Common questions.</h3>
              <p className="mt-1 text-sm text-muted-foreground italic">
                Answer what hosts ask most — saves you typing later.
              </p>
              <div className="mt-4 space-y-3">
                {faqs.map((f, i) => (
                  <div
                    key={f.id ?? `new-faq-${i}`}
                    className="rounded-md border border-border bg-card/40 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        FAQ {i + 1}
                      </p>
                      <button
                        type="button"
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
                    setFaqs((prev) => [
                      ...prev,
                      { id: null, question: "", answer: "" },
                    ])
                  }
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add FAQ
                </Button>
              </div>
            </section>
          </div>
        )}
      </main>

      <footer className="border-t border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-2xl flex items-center justify-between gap-3 px-5 py-4">
          <div className="flex-1 text-xs text-muted-foreground">
            {loading ? (
              <span>Loading…</span>
            ) : validation.length > 0 ? (
              <span>{validation[0]}</span>
            ) : (
              <span>Changes go live as soon as you save.</span>
            )}
          </div>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                {uploadProgress && uploadProgress.total > 0
                  ? `Uploading ${uploadProgress.done}/${uploadProgress.total}…`
                  : "Saving…"}
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      </footer>
    </div>
  );
}

// Drag-sortable wrapper around PhotoTile. @dnd-kit's useSortable
// supplies the transform/transition CSS that moves the tile while
// dragging and the listeners we expose via a small grip handle in
// the top-left corner of each tile. Whole tile isn't draggable so
// the X / Cover buttons inside stay clickable without a long-press
// vs click disambiguation.
function SortablePhotoTile(props: {
  id: string;
  url: string;
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
      <PhotoTile
        {...props}
        dragHandle={{ attributes, listeners }}
      />
    </div>
  );
}

function PhotoTile({
  url,
  isCover,
  onRemove,
  onMakeCover,
  dragHandle,
}: {
  url: string;
  isCover: boolean;
  onRemove: () => void;
  onMakeCover?: () => void;
  dragHandle?: { attributes: Record<string, unknown>; listeners: Record<string, unknown> };
}) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-md bg-secondary/40 group">
      <img src={url} alt="" className="h-full w-full object-cover pointer-events-none select-none" />
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
        type="button"
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
