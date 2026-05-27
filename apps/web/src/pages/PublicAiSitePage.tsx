import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// supabase types not yet regenerated for ai_sites (large types file).
// Cast at call sites until next types pull.
// deno-lint-ignore-file no-explicit-any
const sb = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<unknown>;
};

// Public renderer for AI-built sites. Fetch the stored HTML by slug
// and drop it into a sandboxed iframe. allow-same-origin is off so
// the embedded doc can't read this page's cookies / localStorage —
// belt-and-braces given the HTML was AI-generated.

type SiteRow = {
  slug: string;
  title: string;
  html: string;
};

export default function PublicAiSitePage() {
  const { slug } = useParams<{ slug: string }>();
  const [site, setSite] = useState<SiteRow | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await sb
        .from("ai_sites")
        .select("slug, title, html")
        .eq("slug", slug)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
        return;
      }
      setSite(data as SiteRow);
      void sb.rpc("ai_sites_increment_view", { p_slug: slug });
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (site?.title) {
      document.title = site.title;
    }
  }, [site?.title]);

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-[#fafafa]">
        <div className="text-[14px] uppercase tracking-[2px] text-black/40 mb-4">
          Site not found
        </div>
        <h1 className="text-[28px] font-medium mb-3">
          This link has expired or never existed.
        </h1>
        <Link
          to="/website-builder"
          className="mt-6 bg-black text-white rounded-full px-5 py-2.5 text-[13px] hover:bg-black/90 transition-colors"
        >
          Make your own site
        </Link>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
        <div className="text-[13px] text-black/40">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-white">
      <iframe
        title={site.title}
        srcDoc={site.html}
        sandbox="allow-forms"
        className="w-full border-0 block"
        style={{ height: "100vh" }}
      />
    </div>
  );
}
