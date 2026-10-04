// Public Explore — a social-style feed of vendor work. Dark page (ink,
// cream text, champagne gold) per the owner's mockup. Lives at /explore
// so anyone (signed in or not) can browse.
//
// Everything shown is real: vendor posts and reels, plus photos from
// approved vendors' portfolios. Photos are interleaved one vendor at a
// time so one big portfolio doesn't fill the feed. Actions are the ones
// the product has: save a vendor (heart), share, and open the profile.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight,
  Bookmark,
  Camera,
  Flower2,
  Heart,
  Home,
  LayoutGrid,
  MapPin,
  Play,
  Search,
  Send,
  Sparkles,
  Tag,
  Users,
  UtensilsCrossed,
  ClipboardList,
} from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { Picture } from "@/components/shared/Picture";
import { Skeleton } from "@/components/ui/skeleton";
import { CATEGORY_GROUPS } from "@/data/categoryTaxonomy";
import { useSavedVendors } from "@/hooks/useSavedVendors";
import { supabase } from "@/integrations/supabase/client";
import roses from "@/assets/vendora-feature-1.jpg?as=picture";

const INK = "#14161a";
const CREAM = "#f4f1ea";
const GOLD = "#c9a86a";
const SOFT = "rgba(244,241,234,0.72)";
const PAGE_SIZE = 10;

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
type Tab = "feed" | "reels";

const subsOf = (slug: string) =>
  CATEGORY_GROUPS.find((g) => g.slug === slug)?.subs ?? [];
const CATEGORIES = [
  { label: "Photography", icon: Camera, subs: subsOf("media") },
  { label: "Beauty", icon: Sparkles, subs: ["Beauty", "Grooming Services"] },
  { label: "Food & drink", icon: UtensilsCrossed, subs: subsOf("food-beverage") },
  { label: "Planning", icon: ClipboardList, subs: ["Event Coordinators"] },
  { label: "Decor", icon: Flower2, subs: ["Decor Rentals", "Florists"] },
];

const portfolioUrl = (path: string) =>
  supabase.storage.from("vendor-portfolios").getPublicUrl(path).data.publicUrl;

export default function PublicExplorePage() {
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [coverByVendor, setCoverByVendor] = useState<Map<string, string>>(new Map());
  const [tab, setTab] = useState<Tab>("feed");
  const [category, setCategory] = useState<string | null>(null);
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

  // Vendors matching the category + search; the feed and reels follow.
  const visibleVendorIds = useMemo(() => {
    const subs = CATEGORIES.find((c) => c.label === category)?.subs;
    const term = query.trim().toLowerCase();
    return new Set(
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
    );
  }, [vendors, category, query]);

  const term = query.trim().toLowerCase();
  const visibleFeed = feed.filter(
    (f) =>
      visibleVendorIds.has(f.vendorId) ||
      (term !== "" && category == null && (f.caption ?? "").toLowerCase().includes(term)),
  );
  const visibleReels = reels.filter((r) => visibleVendorIds.has(r.vendorId));
  const visibleVendors = vendors.filter((v) => visibleVendorIds.has(v.id));

  function pickCategory(c: string | null) {
    setCategory(c);
    setShown(PAGE_SIZE);
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: INK, color: CREAM }}>
      <PublicNav tone="dark" />

      <main
        id="main-content"
        className="container mx-auto grid gap-6 px-5 py-6 md:px-8 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_300px]"
      >
        {/* ═══════ LEFT SIDEBAR ═══════ */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-4">
            <div className="rounded-2xl border border-white/15 p-3">
              <p className="m-0 px-3 pb-3 pt-2 text-[32px] font-bold leading-none">Explore</p>
              <nav className="space-y-1" aria-label="Explore">
                <SideItem icon={Home} label="Feed" active={tab === "feed"} onClick={() => setTab("feed")} />
                <SideItem icon={Play} label="Reels" active={tab === "reels"} onClick={() => setTab("reels")} />
                <SideItem icon={Users} label="Vendors" to="/vendors" />
                <SideItem icon={Bookmark} label="Saved" to="/customer/account" />
              </nav>
              <div className="my-3 h-px bg-white/15" />
              <div className="space-y-1">
                <SideItem
                  icon={LayoutGrid}
                  label="All categories"
                  active={category == null}
                  onClick={() => pickCategory(null)}
                />
                {CATEGORIES.map((c) => (
                  <SideItem
                    key={c.label}
                    icon={c.icon}
                    label={c.label}
                    active={category === c.label}
                    onClick={() => pickCategory(c.label)}
                  />
                ))}
              </div>
            </div>

            <Link
              to="/vendors"
              className="group relative block overflow-hidden rounded-2xl border border-white/15"
            >
              <Picture source={roses} alt="" sizes="220px" className="h-56 w-full object-cover" />
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(180deg, rgba(10,11,14,0.9) 0%, rgba(10,11,14,0.55) 55%, rgba(10,11,14,0.8) 100%)" }}
              />
              <div className="absolute inset-0 flex flex-col justify-between p-4">
                <p className="m-0 text-[20px] font-bold leading-snug">
                  Extraordinary vendors for unforgettable events.
                </p>
                <span className="inline-flex items-center gap-1.5 text-[13px] font-bold transition-colors group-hover:text-white" style={{ color: GOLD }}>
                  Explore all vendors <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          </div>
        </aside>

        {/* ═══════ CENTRE ═══════ */}
        <section className="min-w-0">
          <div className="rounded-2xl border border-white/15">
            <div className="flex flex-col gap-4 px-4 pt-5 md:flex-row md:items-center md:justify-between md:px-5">
              <h1 className="m-0 text-[26px] leading-tight md:text-[30px]">
                Your next event starts here.
              </h1>
              <label className="flex h-11 items-center gap-2.5 rounded-full border border-white/15 px-4 md:w-72">
                <Search className="h-4 w-4 shrink-0" style={{ color: GOLD }} aria-hidden />
                <span className="sr-only">Search vendors</span>
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setShown(PAGE_SIZE);
                  }}
                  placeholder="Search vendors, styles, places…"
                  className="w-full bg-transparent text-[14px] outline-none placeholder:text-[#f4f1ea]/55"
                />
              </label>
            </div>

            {/* Tabs */}
            <div className="mt-3 flex gap-6 border-b border-white/15 px-4 md:px-5" role="tablist">
              {(["feed", "reels"] as Tab[]).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`relative pb-3 pt-2 text-[15px] font-bold transition-colors ${
                    tab === t
                      ? "text-gold after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-gold"
                      : "text-[#f4f1ea]/80 hover:text-white"
                  }`}
                >
                  {t === "feed" ? "Feed" : "Reels"}
                </button>
              ))}
            </div>

            {/* Category chips (phones / tablets — the sidebar has them on desktop) */}
            <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-4 lg:hidden">
              {[null, ...CATEGORIES.map((c) => c.label)].map((c) => (
                <button
                  key={c ?? "all"}
                  onClick={() => pickCategory(c)}
                  className={`inline-flex h-9 shrink-0 items-center rounded-full px-4 text-[13px] font-bold transition-colors ${
                    category === c
                      ? "bg-[#f4f1ea] text-foreground"
                      : "border border-white/15 hover:border-white/40"
                  }`}
                >
                  {c ?? "All"}
                </button>
              ))}
            </div>

            {/* Vendor circles */}
            <div className="no-scrollbar flex gap-4 overflow-x-auto px-4 pb-5 pt-5 md:px-5">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-[76px] w-[76px] shrink-0 rounded-full bg-white/10" />
                  ))
                : visibleVendors.map((v) => (
                    <Link
                      key={v.id}
                      to={`/vendors/${v.id}`}
                      className="group flex w-[88px] shrink-0 flex-col items-center gap-2 text-center"
                    >
                      <Avatar src={avatarOf(v)} name={v.business_name} size={76} />
                      <span className="line-clamp-2 text-[12px] leading-tight transition-colors group-hover:text-gold">
                        {v.business_name ?? "Vendor"}
                      </span>
                    </Link>
                  ))}
            </div>
          </div>

          {/* Feed / reels */}
          <div className="mt-4 space-y-4">
            {loading ? (
              <Skeleton className="h-[520px] w-full rounded-2xl bg-white/10" />
            ) : tab === "feed" ? (
              visibleFeed.length === 0 ? (
                <Empty text="Nothing here yet. Try another category or search." />
              ) : (
                <>
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
                  {shown < visibleFeed.length && (
                    <div className="flex justify-center pt-2">
                      <button
                        onClick={() => setShown((n) => n + PAGE_SIZE)}
                        className="inline-flex h-11 items-center rounded-full border border-white/15 px-6 text-[14px] font-bold transition-colors hover:border-white/40"
                      >
                        Show more
                      </button>
                    </div>
                  )}
                </>
              )
            ) : visibleReels.length === 0 ? (
              <Empty text="No reels yet. When vendors share reels, they'll show up here." />
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {visibleReels.map((r) => (
                  <ReelTile key={r.id} reel={r} vendor={vendorById.get(r.vendorId)} avatar={avatarOf(vendorById.get(r.vendorId))} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ═══════ RIGHT RAIL ═══════ */}
        <aside className="hidden xl:block">
          <div className="sticky top-24 space-y-4">
            {visibleReels.length > 0 && (
              <div className="rounded-2xl border border-white/15 p-4">
                <RailHeader title="Reels to inspire" onSeeAll={() => setTab("reels")} />
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {visibleReels.slice(0, 2).map((r) => (
                    <ReelTile key={r.id} reel={r} vendor={vendorById.get(r.vendorId)} avatar={avatarOf(vendorById.get(r.vendorId))} />
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-white/15 p-4">
              <RailHeader title="Meet the vendors" to="/vendors" />
              <ul className="m-0 mt-2 list-none divide-y divide-white/15 p-0">
                {(loading ? [] : visibleVendors.slice(0, 4)).map((v) => (
                  <li key={v.id} className="flex items-center gap-3 py-3">
                    <Avatar src={avatarOf(v)} name={v.business_name} size={56} />
                    <div className="min-w-0">
                      <p className="m-0 truncate text-[15px] font-bold">{v.business_name ?? "Vendor"}</p>
                      <p className="m-0 truncate text-[12.5px]" style={{ color: SOFT }}>
                        {[v.category, v.location].filter(Boolean).join(" · ")}
                      </p>
                      <Link
                        to={`/vendors/${v.id}`}
                        className="mt-1 inline-flex items-center gap-1 text-[13px] font-bold transition-colors hover:text-white"
                        style={{ color: GOLD }}
                      >
                        View profile <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {visibleReels.length === 0 && (
              <div className="rounded-2xl border border-white/15 p-4">
                <p className="m-0 text-[18px] font-bold leading-snug">Are you a vendor?</p>
                <p className="m-0 mt-1.5 text-[13.5px] leading-relaxed" style={{ color: SOFT }}>
                  Share your work here and get found by hosts planning their next event.
                </p>
                <Link
                  to="/signup/vendor"
                  className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-gold px-4 text-[13px] font-bold text-foreground transition-colors hover:bg-gold-hover"
                >
                  Join as a vendor <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </div>
        </aside>
      </main>

      <Footer tone="dark" />
    </div>
  );
}

function SideItem({
  icon: Icon,
  label,
  active = false,
  onClick,
  to,
}: {
  icon: typeof Home;
  label: string;
  active?: boolean;
  onClick?: () => void;
  to?: string;
}) {
  const cls = `flex h-11 w-full items-center gap-3 rounded-xl px-3 text-[15px] transition-colors ${
    active
      ? "bg-white/[0.06] font-bold text-gold shadow-[inset_2px_0_0_hsl(var(--gold))]"
      : "text-[#f4f1ea] hover:bg-white/[0.04]"
  }`;
  const inner = (
    <>
      <Icon className="h-[18px] w-[18px] shrink-0" style={{ color: active ? GOLD : undefined }} aria-hidden />
      {label}
    </>
  );
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls} aria-pressed={active}>
      {inner}
    </button>
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
          <span className="text-[18px] font-bold" style={{ color: GOLD }}>
            {(name ?? "V")[0]?.toUpperCase()}
          </span>
        )}
      </span>
    </span>
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
  const name = vendor?.business_name ?? "Vendor";
  const href = `/vendors/${item.vendorId}`;

  async function share() {
    const url = `${window.location.origin}${href}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      /* share sheet dismissed */
    }
  }

  return (
    <article className="rounded-2xl border border-white/15 bg-white/[0.03] p-2">
      <header className="flex items-center gap-3 px-2 pb-3 pt-2">
        <Link to={href} aria-label={name}>
          <Avatar src={avatar} name={name} size={44} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={href} className="block truncate text-[15px] font-bold transition-colors hover:text-gold">
            {name}
          </Link>
          {vendor?.location && (
            <p className="m-0 truncate text-[12.5px]" style={{ color: SOFT }}>
              {vendor.location}
            </p>
          )}
        </div>
        <Link
          to={href}
          className="inline-flex h-9 shrink-0 items-center rounded-full border border-white/25 px-4 text-[13px] font-bold transition-colors hover:border-white/50"
        >
          View profile
        </Link>
      </header>

      <Link to={href} className="block overflow-hidden rounded-xl bg-white/5">
        <img
          src={item.image}
          alt={item.caption ?? `Work by ${name}`}
          loading={eager ? "eager" : "lazy"}
          className="aspect-[4/5] w-full object-cover sm:aspect-[3/2]"
        />
      </Link>

      <div className="px-2 pb-2 pt-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onSave}
            aria-label={saved ? `Remove ${name} from saved` : `Save ${name}`}
            aria-pressed={saved}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-white/[0.06]"
          >
            <Heart className={`h-[22px] w-[22px] ${saved ? "fill-gold text-gold" : ""}`} />
          </button>
          <button
            type="button"
            onClick={share}
            aria-label={`Share ${name}`}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-white/[0.06]"
          >
            <Send className="h-[21px] w-[21px]" />
          </button>
        </div>

        <p className="m-0 mt-1 px-1 text-[14.5px] leading-relaxed">
          <span className="font-bold">{name}</span>
          {item.caption ? <> {item.caption}</> : null}
        </p>
        <Link
          to={href}
          className="mt-1.5 inline-flex items-center gap-1 px-1 text-[14px] font-bold transition-colors hover:text-white"
          style={{ color: GOLD }}
        >
          View vendor <ArrowRight className="h-3.5 w-3.5" />
        </Link>

        {(vendor?.location || vendor?.category) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/15 px-1 pt-3 text-[12.5px]" style={{ color: SOFT }}>
            {vendor?.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" style={{ color: GOLD }} aria-hidden />
                {vendor.location}
              </span>
            )}
            {vendor?.category && (
              <span className="inline-flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" style={{ color: GOLD }} aria-hidden />
                {vendor.category}
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function ReelTile({
  reel,
  vendor,
  avatar,
}: {
  reel: ReelItem;
  vendor: VendorRow | undefined;
  avatar: string | null;
}) {
  const [playing, setPlaying] = useState(false);
  const name = vendor?.business_name ?? "Vendor";
  return (
    <div className="relative aspect-[9/16] overflow-hidden rounded-xl border border-white/15 bg-black">
      {playing ? (
        <video src={reel.videoUrl} className="h-full w-full object-cover" controls autoPlay playsInline />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Play reel from ${name}`}
          className="group block h-full w-full text-left"
        >
          {reel.thumbnailUrl ? (
            <img src={reel.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <video src={`${reel.videoUrl}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
          )}
          <span className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60">
            <Play className="h-4 w-4 fill-white text-white" />
          </span>
          <span
            className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-2.5"
            style={{ background: "linear-gradient(0deg, rgba(10,11,14,0.85), rgba(10,11,14,0))" }}
          >
            <Avatar src={avatar} name={name} size={30} />
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-bold">{name}</span>
              {reel.caption && (
                <span className="block truncate font-serif text-[11.5px] italic" style={{ color: SOFT }}>
                  {reel.caption}
                </span>
              )}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

function RailHeader({ title, to, onSeeAll }: { title: string; to?: string; onSeeAll?: () => void }) {
  const cls = "inline-flex items-center gap-1 text-[13px] font-bold transition-colors hover:text-white";
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="m-0 text-[20px] leading-tight">{title}</h3>
      {to ? (
        <Link to={to} className={cls} style={{ color: GOLD }}>
          See all <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : (
        <button type="button" onClick={onSeeAll} className={cls} style={{ color: GOLD }}>
          See all <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-white/15 px-6 py-16 text-center">
      <p className="m-0 text-[15px]" style={{ color: SOFT }}>
        {text}
      </p>
    </div>
  );
}
