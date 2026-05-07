import { Link } from "react-router-dom";
import { GitCompare, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompareVendors } from "@/hooks/useCompareVendors";

// Floating bar at the bottom of vendor browse pages. Shows when the
// user has 1+ vendors in their compare shortlist. Tapping the CTA
// goes to /compare for the side-by-side view.

export function CompareBar() {
  const { ids, clear, max } = useCompareVendors();
  if (ids.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 max-w-lg w-[calc(100%-2rem)] rounded-full border border-border bg-background/95 backdrop-blur-sm shadow-lg flex items-center gap-3 px-4 py-2.5"
      role="status"
      aria-live="polite"
    >
      <GitCompare className="w-4 h-4 text-accent shrink-0" />
      <p className="text-sm font-medium flex-1 truncate">
        {ids.length} of {max} ready to compare
      </p>
      <button
        type="button"
        onClick={clear}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Clear compare list"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <Button
        asChild
        size="sm"
        className="rounded-full bg-foreground text-background hover:bg-foreground/90"
        disabled={ids.length < 2}
      >
        <Link to="/compare">
          Compare
          <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
        </Link>
      </Button>
    </div>
  );
}
