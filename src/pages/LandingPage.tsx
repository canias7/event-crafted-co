import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";

// Minimal landing — header + footer over a black canvas. Marketing
// copy, hero slideshow, feature grid, stats, and FAQs were stripped
// out so the page can be rebuilt from scratch later. Background is
// the dark `bg-foreground` token and text inherits the `text-
// background` inverse so anything dropped in renders in the right
// palette without per-element overrides.
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-foreground text-background flex flex-col">
      <PublicNav />
      <main id="main-content" className="flex-1" />
      <Footer />
    </div>
  );
}
