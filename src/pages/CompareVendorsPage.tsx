import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  GitCompare,
  ArrowLeft,
  Star,
  MapPin,
  X,
  Zap,
  ExternalLink,
} from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { Button } from "@/components/ui/button";
import { useVendors } from "@/hooks/useVendors";
import { useCompareVendors } from "@/hooks/useCompareVendors";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

// Side-by-side vendor comparison. The user's shortlist (max 4) lives
// in localStorage via useCompareVendors. This page reads that list,
// pulls the matching vendors from useVendors() (already cached on
// browse), and renders a comparable table.

export default function CompareVendorsPage() {
  const { ids, toggle, clear } = useCompareVendors();
  const { vendors, loading } = useVendors();

  const selected = useMemo(
    () => ids.map((id) => vendors.find((v) => v.id === id)).filter(Boolean),
    [ids, vendors],
  ) as typeof vendors;

  useDocumentMeta({
    title: "Compare vendors — Vendora",
    description: "Side-by-side comparison of vendors you've shortlisted.",
    type: "website",
  });

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <section className="pt-32 pb-12 md:pt-36 border-b border-border">
        <div className="container mx-auto px-6 md:px-8 max-w-6xl">
          <Link
            to="/vendors"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to vendors
          </Link>
          <p className="font-label text-accent mb-3 inline-flex items-center gap-1.5">
            <GitCompare className="w-3 h-3" />
            Side-by-side
          </p>
          <h1 className="font-display text-4xl md:text-5xl mb-3 leading-tight">
            Compare vendors
          </h1>
          <p className="text-muted-foreground max-w-xl leading-relaxed">
            Shortlisted vendors, lined up to make the choice easier. Add
            up to 4 from any vendor browse page.
          </p>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container mx-auto px-6 md:px-8 max-w-6xl">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : selected.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <p className="text-sm text-muted-foreground">
                  Comparing {selected.length} vendor
                  {selected.length === 1 ? "" : "s"}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  onClick={clear}
                >
                  Clear all
                </Button>
              </div>

              {/* Mobile: stacked cards. Desktop: real table. */}
              <div className="md:hidden space-y-6">
                {selected.map((v) => (
                  <article
                    key={v.id}
                    className="rounded-sm border border-border bg-card p-5"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h2 className="font-display text-xl">{v.name}</h2>
                        <p className="text-xs text-muted-foreground capitalize mt-0.5">
                          {v.category}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggle(v.id)}
                        className="text-muted-foreground hover:text-foreground p-1"
                        aria-label="Remove from compare"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <Row label="Rating" value={<RatingCell v={v} />} />
                    <Row
                      label="From"
                      value={
                        <span className="tnum font-medium">
                          ${v.startingPrice.toLocaleString()}
                        </span>
                      }
                    />
                    <Row
                      label="Location"
                      value={
                        <span className="inline-flex items-center gap-1 text-sm">
                          <MapPin className="w-3 h-3" />
                          {v.location ?? v.distance}
                        </span>
                      }
                    />
                    <Row
                      label="Response"
                      value={
                        v.responderTier === "fast" ? (
                          <span className="inline-flex items-center gap-1 text-accent text-sm">
                            <Zap className="w-3 h-3" />
                            Fast responder
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Standard
                          </span>
                        )
                      }
                    />
                    <Row label="Bio" value={<BioCell v={v} />} />
                    <Link
                      to={`/vendors/${v.id}`}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline mt-3"
                    >
                      View profile
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </article>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left text-xs font-label text-muted-foreground uppercase tracking-wide pb-3 pr-4 align-bottom" />
                      {selected.map((v) => (
                        <th
                          key={v.id}
                          className="text-left pb-4 px-4 align-top min-w-[200px]"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h2 className="font-display text-xl leading-tight">
                                {v.name}
                              </h2>
                              <p className="text-xs text-muted-foreground capitalize mt-0.5">
                                {v.category}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggle(v.id)}
                              className="text-muted-foreground hover:text-foreground p-0.5"
                              aria-label="Remove from compare"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <TableRow label="Rating">
                      {selected.map((v) => (
                        <td key={v.id} className="py-3 px-4 align-top">
                          <RatingCell v={v} />
                        </td>
                      ))}
                    </TableRow>
                    <TableRow label="Starting price">
                      {selected.map((v) => (
                        <td
                          key={v.id}
                          className="py-3 px-4 align-top tnum font-medium"
                        >
                          ${v.startingPrice.toLocaleString()}
                        </td>
                      ))}
                    </TableRow>
                    <TableRow label="Location">
                      {selected.map((v) => (
                        <td key={v.id} className="py-3 px-4 align-top text-sm">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {v.location ?? v.distance}
                          </span>
                        </td>
                      ))}
                    </TableRow>
                    <TableRow label="Response">
                      {selected.map((v) => (
                        <td key={v.id} className="py-3 px-4 align-top text-sm">
                          {v.responderTier === "fast" ? (
                            <span className="inline-flex items-center gap-1 text-accent">
                              <Zap className="w-3 h-3" />
                              Fast responder
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              Standard
                            </span>
                          )}
                        </td>
                      ))}
                    </TableRow>
                    <TableRow label="About">
                      {selected.map((v) => (
                        <td key={v.id} className="py-3 px-4 align-top">
                          <BioCell v={v} />
                        </td>
                      ))}
                    </TableRow>
                    <TableRow label="">
                      {selected.map((v) => (
                        <td key={v.id} className="py-3 px-4 align-top">
                          <Link
                            to={`/vendors/${v.id}`}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
                          >
                            View profile
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </td>
                      ))}
                    </TableRow>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-3 py-2 border-b border-border/50 last:border-b-0">
      <span className="text-xs font-label text-muted-foreground uppercase tracking-wide pt-0.5">
        {label}
      </span>
      <div>{value}</div>
    </div>
  );
}

function TableRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <tr className="border-t border-border">
      <th className="text-left text-xs font-label text-muted-foreground uppercase tracking-wide py-3 pr-4 align-top">
        {label}
      </th>
      {children}
    </tr>
  );
}

function RatingCell({
  v,
}: {
  v: { rating: number; reviews: number };
}) {
  if (v.reviews === 0) {
    return <span className="text-sm text-muted-foreground">No reviews yet</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Star className="w-3 h-3 fill-accent text-accent" />
      <span className="tnum font-medium">{v.rating.toFixed(1)}</span>
      <span className="text-muted-foreground tnum">({v.reviews})</span>
    </span>
  );
}

function BioCell({ v }: { v: { description: string } }) {
  return (
    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
      {v.description}
    </p>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16">
      <GitCompare className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
      <h2 className="font-display text-2xl mb-2">Nothing to compare yet</h2>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6 leading-relaxed">
        Browse vendors and tap the compare icon on a card to add it to
        your shortlist. Up to 4 at a time.
      </p>
      <Button
        asChild
        className="rounded-full bg-foreground text-background hover:bg-foreground/90"
      >
        <Link to="/vendors">Browse vendors</Link>
      </Button>
    </div>
  );
}
