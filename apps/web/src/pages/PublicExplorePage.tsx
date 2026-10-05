// Public Explore: vendor work to browse, on the dark brand pages (ink,
// cream text, champagne gold). Lives at /explore so anyone (signed in or
// not) can browse. Layout from the owner's mockups: an open two-column
// gallery for the feed, and one large reel at a time for reels. The tab
// is in the URL (?tab=reels) so it can be linked to.
//
// Everything shown is real: vendor posts and reels, plus photos from
// approved vendors' portfolios. Photos are interleaved one vendor at a
// time so one big portfolio doesn't fill the feed. Actions are the ones
// the product has: save a vendor (heart), share, and open the profile.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowRight, ChevronDown, ChevronUp, Heart, Play, Search, Share, Volume2, VolumeX, X } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { VendorCard } from "@/components/shared/VendorCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BROWSE_CATEGORIES } from "@/data/browseCategories";
import { useAuth } from "@/hooks/useAuth";
import { useSavedVendors } from "@/hooks/useSavedVendors";
import { useVendors } from "@/hooks/useVendors";
import { supabase } from "@/integrations/supabase/client";
import i18n from "@/i18n";
import { useCategoryNames } from "@/lib/categoryNames";

const INK = "#14161a";
const GOLD = "#c9a86a";
const SOFT = "rgba(244,241,234,0.72)";
const PAGE_SIZE = 12;
const ALL = "all";

interface VendorRow {
  id: string;
  business_name: string | null;
  category: string | null;
  location: string | null;
  logo_url: string | null;
}
interface FeedItem {
  key: string;
  vendorId: string;
  image: string;
  caption: string | null;
  createdAt: string;
}
interface ReelItem {
  id: string;
  vendorId: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  caption: string | null;
}
type Tab = "feed" | "reels" | "vendors" | "saved";

// Each tab's label and line under the title are in the explore
// namespace: tabs.<id>.label / tabs.<id>.sub.
const TABS: { id: Tab }[] = [{ id: "feed" }, { id: "reels" }, { id: "vendors" }, { id: "saved" }];

const portfolioUrl = (path: string) =>
  supabase.storage.from("vendor-portfolios").getPublicUrl(path).data.publicUrl;

async function shareVendor(name: string, href: string) {
  const url = `${window.location.origin}${href}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: name, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success(i18n.t("toasts.linkCopied", { ns: "explore" }));
  } catch {
    /* share sheet dismissed */
  }
}

export default function PublicExplorePage() {
  const { t } = useTranslation("explore");
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [coverByVendor, setCoverByVendor] = useState<Map<string, string>>(new Map());
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: Tab = TABS.some((item) => item.id === tabParam) ? (tabParam as Tab) : "feed";
  const [category, setCategory] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const { isSaved, toggle } = useSavedVendors();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [vendorsRes, photosRes, postsRes, reelsRes] = await Promise.all([
        supabase
          .from("vendor_profiles")
          .select("id, business_name, category, location, logo_url")
          .eq("application_status", "approved")
          .order("created_at", { ascending: false })
          .limit(60),
        supabase
          .from("vendor_portfolio_images")
          .select("id, vendor_id, storage_path, caption, created_at, display_order")
          .order("display_order", { ascending: true })
          .limit(400),
        supabase
          .from("vendor_posts")
          .select("id, vendor_id, image_url, caption, created_at")
          .order("created_at", { ascending: false })
          .limit(60),
        supabase
          .from("vendor_reels")
          .select("id, vendor_id, video_url, thumbnail_url, caption, created_at")
          .order("created_at", { ascending: false })
          .limit(40),
      ]);
      if (cancelled) return;

      const approved = (vendorsRes.data ?? []) as VendorRow[];
      const ok = new Set(approved.map((v) => v.id));

      // Posts first (newest), then portfolio photos one vendor at a time.
      const posts: FeedItem[] = (postsRes.data ?? [])
        .filter((p) => ok.has(p.vendor_id) && p.image_url)
        .map((p) => ({
          key: `post-${p.id}`,
          vendorId: p.vendor_id,
          image: p.image_url,
          caption: p.caption,
          createdAt: p.created_at,
        }));
      const byVendor = new Map<string, FeedItem[]>();
      const covers = new Map<string, string>();
      for (const r of photosRes.data ?? []) {
        if (!ok.has(r.vendor_id) || !r.storage_path) continue;
        const item: FeedItem = {
          key: `photo-${r.id}`,
          vendorId: r.vendor_id,
          image: portfolioUrl(r.storage_path),
          caption: r.caption,
          createdAt: r.created_at,
        };
        if (!covers.has(r.vendor_id)) covers.set(r.vendor_id, item.image);
        const list = byVendor.get(r.vendor_id);
        if (list) list.push(item);
        else byVendor.set(r.vendor_id, [item]);
      }
      const photos: FeedItem[] = [];
      const queues = Array.from(byVendor.values());
      for (let i = 0; queues.some((q) => i < q.length); i++) {
        for (const q of queues) if (i < q.length) photos.push(q[i]);
      }

      setVendors(approved);
      setCoverByVendor(covers);
      setFeed([...posts, ...photos]);
      setReels(
        (reelsRes.data ?? [])
          .filter((r) => ok.has(r.vendor_id) && r.video_url)
          .map((r) => ({
            id: r.id,
            vendorId: r.vendor_id,
            videoUrl: r.video_url,
            thumbnailUrl: r.thumbnail_url,
            caption: r.caption,
          })),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const vendorById = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);
  const avatarOf = (v: VendorRow | undefined) =>
    v ? (v.logo_url ?? coverByVendor.get(v.id) ?? null) : null;

  const subs = BROWSE_CATEGORIES.find((c) => c.label === category)?.subs;
  const term = query.trim().toLowerCase();

  // Vendors matching the category + search; the feed and reels follow.
  const visibleVendorIds = useMemo(
    () =>
      new Set(
        vendors
          .filter((v) => !subs || (v.category != null && subs.includes(v.category)))
          .filter(
            (v) =>
              term === "" ||
              [v.business_name, v.category, v.location]
                .filter(Boolean)
                .some((s) => (s as string).toLowerCase().includes(term)),
          )
          .map((v) => v.id),
      ),
    [vendors, subs, term],
  );

  const visibleFeed = feed.filter(
    (f) =>
      visibleVendorIds.has(f.vendorId) ||
      (term !== "" && !subs && (f.caption ?? "").toLowerCase().includes(term)),
  );
  const visibleReels = reels.filter((r) => visibleVendorIds.has(r.vendorId));

  function pickTab(t: Tab) {
    setShown(PAGE_SIZE);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (t === "feed") next.delete("tab");
        else next.set("tab", t);
        return next;
      },
      { replace: true },
    );
  }

  function pickCategory(c: string) {
    setCategory(c);
    setShown(PAGE_SIZE);
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: INK, color: "#f4f1ea" }}>
      <PublicNav tone="dark" />

      <main id="main-content" className="container mx-auto px-5 pb-16 pt-8 md:px-8 md:pb-24 md:pt-12">
        {/* ═══════ HEADER: title + search ═══════ */}
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="m-0 text-[40px] leading-none md:text-[52px]">{t("title")}</h1>
            <p className="m-0 mt-3 text-[15px] md:text-base" style={{ color: SOFT }}>
              {t(`tabs.${tab}.sub`)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex h-11 min-w-[180px] flex-1 items-center gap-2.5 rounded-xl border border-white/15 bg-white/[0.04] px-4 transition-colors focus-within:border-white/40 md:w-80 md:flex-none">
              <Search className="h-4 w-4 shrink-0 text-gold" aria-hidden />
              <span className="sr-only">{t("search.label")}</span>
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShown(PAGE_SIZE);
                }}
                placeholder={t("search.placeholder")}
                className="w-full min-w-0 bg-transparent text-[14px] text-[#f4f1ea] outline-none placeholder:text-[#f4f1ea]/60"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label={t("search.clear")} className="hover:text-gold">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </label>
            {/* Phones: the category menu sits beside search; from tablets
                up it sits at the end of the tabs row. */}
            <CategorySelect value={category} onChange={pickCategory} className="md:hidden" />
          </div>
        </div>

        {/* ═══════ TABS + category ═══════ */}
        <div className="mt-6 flex items-center justify-between gap-4 border-b border-white/15">
          <div className="no-scrollbar flex gap-6 overflow-x-auto" role="tablist" aria-label={t("tablistLabel")}>
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => pickTab(item.id)}
                className={`relative shrink-0 pb-3 pt-2 text-[15px] font-bold transition-colors ${
                  tab === item.id
                    ? "text-gold after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-gold"
                    : "text-[#f4f1ea]/80 hover:text-white"
                }`}
              >
                {t(`tabs.${item.id}.label`)}
              </button>
            ))}
          </div>
          <CategorySelect value={category} onChange={pickCategory} className="mb-2 hidden md:flex" />
        </div>

        {/* ═══════ CONTENT ═══════ */}
        <div className="pt-8">
          {tab === "feed" &&
            (loading ? (
              <div className="grid gap-x-6 gap-y-10 md:grid-cols-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full bg-white/10" />
                      <Skeleton className="h-4 w-40 bg-white/10" />
                    </div>
                    <Skeleton className="mt-3 aspect-[4/5] w-full rounded-2xl bg-white/10 md:aspect-[4/3]" />
                  </div>
                ))}
              </div>
            ) : visibleFeed.length === 0 ? (
              <Empty title={t("empty.feed")} body={t("empty.tryAnother")} />
            ) : (
              <>
                <div className="grid gap-x-6 gap-y-10 md:grid-cols-2">
                  {visibleFeed.slice(0, shown).map((item, i) => (
                    <FeedPost
                      key={item.key}
                      item={item}
                      vendor={vendorById.get(item.vendorId)}
                      avatar={avatarOf(vendorById.get(item.vendorId))}
                      eager={i < 2}
                      saved={isSaved(item.vendorId)}
                      onSave={() => toggle(item.vendorId, { isReal: true })}
                    />
                  ))}
                </div>
                {shown < visibleFeed.length && (
                  <div className="flex justify-center pt-10">
                    <button
                      type="button"
                      onClick={() => setShown((n) => n + PAGE_SIZE)}
                      className="inline-flex h-11 items-center rounded-full border border-white/15 bg-white/[0.04] px-6 text-[14px] font-bold transition-colors hover:border-white/40"
                    >
                      {t("showMore")}
                    </button>
                  </div>
                )}
              </>
            ))}

          {tab === "reels" &&
            (loading ? (
              <Skeleton className="mx-auto aspect-[9/16] w-full max-w-[300px] rounded-2xl bg-white/10" />
            ) : (
              <ReelsView
                reels={visibleReels}
                vendorById={vendorById}
                avatarOf={avatarOf}
                isSaved={isSaved}
                onSave={(id) => toggle(id, { isReal: true })}
                onBrowseFeed={() => pickTab("feed")}
                filtered={reels.length > 0}
              />
            ))}

          {tab === "vendors" && <VendorsGrid subs={subs} term={term} />}

          {tab === "saved" && <SavedView subs={subs} term={term} onBrowse={() => pickTab("feed")} />}
        </div>
      </main>

      <Footer tone="dark" />
    </div>
  );
}

function CategorySelect({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const { t } = useTranslation("explore");
  const categoryNames = useCategoryNames();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={t("category.label")}
        className={`h-11 w-[188px] shrink-0 rounded-full border-white/15 bg-white/[0.04] px-4 text-[14px] font-bold text-[#f4f1ea] ${className}`}
      >
        <SelectValue>{value === ALL ? categoryNames.all : categoryNames.browse(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{categoryNames.all}</SelectItem>
        {BROWSE_CATEGORIES.map((c) => (
          <SelectItem key={c.label} value={c.label}>
            {categoryNames.browse(c.label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Avatar({ src, name, size }: { src: string | null; name: string | null; size: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full p-[2px]"
      style={{ width: size, height: size, background: GOLD }}
    >
      <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2" style={{ borderColor: INK, background: "#24262b" }}>
        {src ? (
          <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="text-[15px] font-bold" style={{ color: GOLD }}>
            {(name ?? "V")[0]?.toUpperCase()}
          </span>
        )}
      </span>
    </span>
  );
}

// Round icon-only action (save, share).
function IconAction({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-white/[0.06]"
    >
      {children}
    </button>
  );
}

function FeedPost({
  item,
  vendor,
  avatar,
  eager,
  saved,
  onSave,
}: {
  item: FeedItem;
  vendor: VendorRow | undefined;
  avatar: string | null;
  eager: boolean;
  saved: boolean;
  onSave: () => void;
}) {
  const { t } = useTranslation("explore");
  const categoryNames = useCategoryNames();
  const name = vendor?.business_name ?? t("vendorFallback");
  const href = `/vendors/${item.vendorId}`;
  const meta = [vendor?.category ? categoryNames.sub(vendor.category) : null, vendor?.location]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="min-w-0 border-b border-white/15 pb-8">
      <header className="flex items-center gap-3">
        <Link to={href} tabIndex={-1} aria-hidden>
          <Avatar src={avatar} name={name} size={40} />
        </Link>
        <div className="min-w-0">
          <Link to={href} className="block truncate text-[15px] font-bold transition-colors hover:text-gold">
            {name}
          </Link>
          {meta && (
            <p className="m-0 truncate text-[12.5px]" style={{ color: SOFT }}>
              {meta}
            </p>
          )}
        </div>
      </header>

      <Link to={href} className="group mt-3 block overflow-hidden rounded-2xl bg-white/5" aria-label={t("post.viewProfileOf", { name })}>
        <img
          src={item.image}
          alt={item.caption ?? t("post.workBy", { name })}
          loading={eager ? "eager" : "lazy"}
          className="aspect-[4/5] w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03] md:aspect-[4/3]"
        />
      </Link>

      <div className="-ml-2 mt-2 flex items-center">
        <IconAction label={saved ? t("post.unsave", { name }) : t("post.save", { name })} pressed={saved} onClick={onSave}>
          <Heart className={`h-[22px] w-[22px] ${saved ? "fill-gold text-gold" : ""}`} />
        </IconAction>
        <IconAction label={t("post.share", { name })} onClick={() => shareVendor(name, href)}>
          <Share className="h-[20px] w-[20px]" />
        </IconAction>
      </div>

      {item.caption && <p className="m-0 mt-1 font-serif text-[15px] italic leading-relaxed">{item.caption}</p>}
      <Link
        to={href}
        className="mt-2 inline-flex items-center gap-1 text-[14px] font-bold text-gold transition-colors hover:text-white"
      >
        {t("post.viewProfile")} <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </article>
  );
}

// One large reel at a time, with save / share / profile beside it and
// up / down to move through them.
function ReelsView({
  reels,
  vendorById,
  avatarOf,
  isSaved,
  onSave,
  onBrowseFeed,
  filtered,
}: {
  reels: ReelItem[];
  vendorById: Map<string, VendorRow>;
  avatarOf: (v: VendorRow | undefined) => string | null;
  isSaved: (id: string) => boolean;
  onSave: (vendorId: string) => void;
  onBrowseFeed: () => void;
  /** True when reels exist but the category / search hides them all. */
  filtered: boolean;
}) {
  const { t } = useTranslation("explore");
  const categoryNames = useCategoryNames();
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (index > 0 && index >= reels.length) setIndex(0);
  }, [index, reels.length]);

  if (reels.length === 0) {
    return (
      <div className="flex justify-center">
        <div className="flex aspect-[9/16] w-full max-w-[300px] flex-col items-center justify-center rounded-2xl border border-white/15 bg-white/[0.03] px-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/15">
            <Play className="h-5 w-5 text-gold" aria-hidden />
          </span>
          <h2 className="m-0 mt-5 text-[24px] leading-tight">{filtered ? t("reels.emptyFiltered") : t("reels.empty")}</h2>
          <p className="m-0 mt-2 text-[14px] leading-relaxed" style={{ color: SOFT }}>
            {filtered
              ? t("empty.tryAnother")
              : t("reels.emptyBody")}
          </p>
          <button
            type="button"
            onClick={onBrowseFeed}
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-gold px-5 text-[14px] font-bold text-foreground transition-colors hover:bg-gold-hover"
          >
            {t("browseFeed")} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  const current = Math.min(index, reels.length - 1);
  const reel = reels[current];
  const vendor = vendorById.get(reel.vendorId);
  const name = vendor?.business_name ?? t("vendorFallback");
  const href = `/vendors/${reel.vendorId}`;
  const saved = isSaved(reel.vendorId);
  const go = (d: number) => setIndex(Math.max(0, Math.min(reels.length - 1, current + d)));
  const navButton =
    "flex h-11 w-11 items-center justify-center rounded-full border border-white/15 transition-colors hover:border-white/40 disabled:pointer-events-none disabled:text-[#f4f1ea]/30";
  const reelAction =
    "flex h-11 min-w-11 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-full text-[12px] font-bold transition-colors hover:text-gold md:h-auto md:rounded-xl md:px-2 md:py-1";

  return (
    <section
      aria-label={t("reels.regionLabel")}
      aria-roledescription={t("reels.roleDescription")}
      className="flex flex-col items-center gap-4 md:grid md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-6 lg:gap-8"
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          go(1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          go(-1);
        }
      }}
    >
      <div className="hidden md:block" aria-hidden />
      <div
        className="relative aspect-[9/16] w-full max-w-[400px] overflow-hidden rounded-2xl bg-black md:h-[clamp(440px,calc(100vh-340px),720px)] md:w-auto md:max-w-none"
        aria-label={t("reels.position", { current: current + 1, total: reels.length, name })}
      >
        <video
          key={reel.id}
          src={reel.videoUrl}
          poster={reel.thumbnailUrl ?? undefined}
          autoPlay={!reduceMotion}
          muted={muted}
          loop
          playsInline
          controls={false}
          onClick={(e) => {
            const v = e.currentTarget;
            if (v.paused) void v.play();
            else v.pause();
          }}
          className="h-full w-full cursor-pointer object-cover"
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-3 p-4 pr-16 pt-16"
          style={{ background: "linear-gradient(0deg, rgba(10,11,14,0.85), rgba(10,11,14,0))" }}
        >
          <Avatar src={avatarOf(vendor)} name={name} size={40} />
          <div className="min-w-0">
            <p className="m-0 truncate text-[15px] font-bold">{name}</p>
            {reel.caption && (
              <p className="m-0 line-clamp-2 font-serif text-[13.5px] italic leading-snug">{reel.caption}</p>
            )}
            {vendor?.category && (
              <p className="m-0 truncate text-[12px]" style={{ color: SOFT }}>
                {categoryNames.sub(vendor.category)}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? t("reels.soundOn") : t("reels.soundOff")}
          className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>

      {/* Actions and up / down: a row under the reel on phones, two
          columns beside it from tablets up. */}
      <div className="flex w-full max-w-[400px] flex-wrap items-center gap-2 md:w-auto md:max-w-none md:flex-nowrap md:gap-6 lg:gap-12">
        <div className="flex flex-1 items-center gap-2 md:flex-none md:flex-col md:gap-5">
          {/* Icons only on phones; labelled from tablets up. */}
          <button
            type="button"
            onClick={() => onSave(reel.vendorId)}
            aria-pressed={saved}
            aria-label={saved ? t("reels.saved") : t("reels.save")}
            className={reelAction}
          >
            <Heart className={`h-6 w-6 ${saved ? "fill-gold text-gold" : ""}`} aria-hidden />
            <span className="hidden md:inline">{saved ? t("reels.saved") : t("reels.save")}</span>
          </button>
          <button type="button" onClick={() => shareVendor(name, href)} aria-label={t("reels.share")} className={reelAction}>
            <Share className="h-6 w-6" aria-hidden />
            <span className="hidden md:inline">{t("reels.share")}</span>
          </button>
          <Link
            to={href}
            className="ml-auto inline-flex h-9 items-center whitespace-nowrap rounded-full bg-gold px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-gold-hover md:ml-0"
          >
            {t("post.viewProfile")}
          </Link>
        </div>
        <div className="flex gap-2 md:flex-col md:gap-3">
          <button type="button" onClick={() => go(-1)} disabled={current === 0} aria-label={t("reels.previous")} className={navButton}>
            <ChevronUp className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => go(1)} disabled={current === reels.length - 1} aria-label={t("reels.next")} className={navButton}>
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  );
}

// Vendor cards for the Vendors and Saved tabs (same cards as /vendors).
function VendorsGrid({
  subs,
  term,
  onlyIds,
  empty,
}: {
  subs: string[] | undefined;
  term: string;
  onlyIds?: Set<string>;
  empty?: ReactNode;
}) {
  const { t } = useTranslation("explore");
  const { vendors, loading } = useVendors();
  const list = vendors
    .filter((v) => !onlyIds || onlyIds.has(v.id))
    .filter((v) => !subs || subs.includes(v.category))
    .filter(
      (v) =>
        term === "" ||
        [v.name, v.category, v.location, v.description]
          .filter(Boolean)
          .some((s) => (s as string).toLowerCase().includes(term)),
    );

  if (loading && vendors.length === 0) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/5] w-full rounded-2xl bg-white/10" />
        ))}
      </div>
    );
  }
  if (list.length === 0) {
    return <>{empty ?? <Empty title={t("empty.vendors")} body={t("empty.tryAnother")} />}</>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {list.map((v, i) => (
        <div key={v.id} className="min-w-0">
          <VendorCard vendor={v} eager={i < 4} tone="dark" tall />
        </div>
      ))}
    </div>
  );
}

function SavedView({
  subs,
  term,
  onBrowse,
}: {
  subs: string[] | undefined;
  term: string;
  onBrowse: () => void;
}) {
  const { t } = useTranslation("explore");
  const { user } = useAuth();
  const { savedIds, loading } = useSavedVendors();

  if (!user) {
    return (
      <Empty title={t("saved.signedOutTitle")} body={t("saved.signedOutBody")}>
        <Link
          to="/login"
          className="inline-flex h-11 items-center rounded-full border border-border bg-white px-5 text-[14px] font-bold text-foreground transition-colors hover:border-foreground/30"
        >
          {t("saved.logIn")}
        </Link>
        <Link
          to="/signup"
          className="inline-flex h-11 items-center rounded-full bg-gold px-5 text-[14px] font-bold text-foreground transition-colors hover:bg-gold-hover"
        >
          {t("saved.signUp")}
        </Link>
      </Empty>
    );
  }
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/5] w-full rounded-2xl bg-white/10" />
        ))}
      </div>
    );
  }
  return (
    <VendorsGrid
      subs={subs}
      term={term}
      onlyIds={savedIds}
      empty={
        <Empty
          title={savedIds.size === 0 ? t("saved.noneTitle") : t("saved.noneHereTitle")}
          body={
            savedIds.size === 0
              ? t("saved.noneBody")
              : t("empty.tryAnother")
          }
        >
          {savedIds.size === 0 && (
            <button
              type="button"
              onClick={onBrowse}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-gold px-5 text-[14px] font-bold text-foreground transition-colors hover:bg-gold-hover"
            >
              {t("browseFeed")} <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </Empty>
      }
    />
  );
}

function Empty({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/15 px-6 py-16 text-center">
      <h2 className="m-0 text-[24px] leading-tight">{title}</h2>
      <p className="m-0 mx-auto mt-2 max-w-sm text-[15px] leading-relaxed" style={{ color: SOFT }}>
        {body}
      </p>
      {children && <div className="mt-6 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  );
}
