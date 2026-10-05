import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";

// 404, in the dark public layout: the nav, a short note and the footer
// (with the language switcher), so a wrong link still feels like Vendora.
const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen text-[#f4f1ea]" style={{ backgroundColor: "#14161a" }}>
      <PublicNav tone="dark" />
      <main id="main-content" className="container mx-auto px-5 py-24 text-center md:px-8 md:py-32">
        <p className="m-0 font-label text-gold">404</p>
        <h1 className="m-0 mt-3 text-[36px] leading-tight md:text-[48px]">Page not found</h1>
        <p className="m-0 mx-auto mt-4 max-w-md text-[16px] leading-relaxed text-[#f4f1ea]/80">
          This page doesn't exist or has moved.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <Link
            to="/"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-gold px-6 text-[15px] font-bold text-foreground transition-colors hover:bg-gold-hover"
          >
            Back to home <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/vendors"
            className="inline-flex h-11 items-center gap-1.5 text-[15px] font-bold text-gold transition-colors hover:text-white"
          >
            Browse vendors <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
      <Footer tone="dark" />
    </div>
  );
};

export default NotFound;
