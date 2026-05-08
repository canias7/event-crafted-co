import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";

// Minimal landing — header + footer over a cream canvas. Marketing
// copy, hero slideshow, feature grid, stats, and FAQs were stripped
// out so the page can be rebuilt from scratch later. Background uses
// the default `bg-background` (cream) so the page reads as one
// continuous surface with the rest of the public site.
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <PublicNav />
      <main id="main-content" className="flex-1" />
      <Footer />
    </div>
  );
}
