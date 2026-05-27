import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { VendoraLogo } from "@/components/shared/VendoraLogo";

// AI Website Builder. Chat on the left, live HTML preview on the
// right. First message creates a new site (slug minted server-side);
// subsequent messages send `edit_site_id` so Claude rewrites the
// existing HTML in place, same slug stays valid.
//
// SSE stream → iframe.contentDocument.write() so the browser renders
// progressively as bytes arrive.
//
// Anonymous-friendly: works without sign-in. Signed-in users get
// ownership stamped on the site (for /my-sites + slug rename).

type ChatMessage = { role: "user" | "assistant"; content: string };

const EXAMPLE_PROMPTS = [
  "Make me a wedding website for Sarah & James in Tulum, Oct 14 2026, beachy boho vibe",
  "1st birthday party site for baby Mila — pastel pink, butterflies, cute",
  "Engagement party invite, dusty blue + gold, formal, downtown loft venue",
  "Backyard BBQ for July 4th — red white blue, casual, fun copy",
];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// deno-lint-ignore-file no-explicit-any — supabase types not regenerated
// for ai_sites yet. Local casts cover the gap.
const sb = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>;
  from: (t: string) => any;
};

export default function WebsiteBuilderPage() {
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const resumeSiteId = searchParams.get("site");

  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [hasContent, setHasContent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [listening, setListening] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<
    Array<{ version_number: number; prompt: string | null; created_at: string }>
  >([]);
  const [versionsBusy, setVersionsBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState<number | null>(null);
  const [guestsOpen, setGuestsOpen] = useState(false);
  const [guests, setGuests] = useState<
    Array<{ id: string; name: string; email: string | null; token: string; plus_one_allowed?: boolean }>
  >([]);
  const [guestsBusy, setGuestsBusy] = useState(false);

  // Moderation modal: lists comment-wall messages + photo-album
  // uploads guests have posted. Owner can hide (approved=false) or
  // delete. Tabs switch between the two streams.
  const [modOpen, setModOpen] = useState(false);
  const [modTab, setModTab] = useState<"messages" | "photos">("messages");
  const [modBusy, setModBusy] = useState(false);
  const [modMessages, setModMessages] = useState<
    Array<{ id: string; name: string; message: string; approved: boolean; created_at: string }>
  >([]);
  const [modPhotos, setModPhotos] = useState<
    Array<{ id: string; photo_url: string; uploader_name: string | null; caption: string | null; approved: boolean; uploaded_at: string }>
  >([]);
  const [guestImport, setGuestImport] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [editCount, setEditCount] = useState(0);

  // The builder iframe writes HTML directly via doc.write() — it does
  // NOT go through ai-site-render's placeholder pipeline. So the
  // __GUEST_BLOCK__ / __PLUS_ONE_BLOCK__ / etc. placeholders show up
  // as literal text in the preview. Strip them client-side so the
  // preview looks polished. The real placeholders get resolved
  // server-side when guests visit /s/<slug>.
  function previewClean(html: string): string {
    return html
      .replaceAll("__GUEST_BLOCK__", "")
      .replaceAll("__GUEST_NAME__", "friend")
      .replaceAll(
        "__PLUS_ONE_BLOCK__",
        '<small style="opacity:0.5;display:block;margin-top:0.5rem">[Plus-one fields appear here when an allowed guest opens their personalized link]</small>',
      )
      .replaceAll(
        "__COMMENT_WALL__",
        '<div style="opacity:0.5;font-style:italic;padding:1rem;text-align:center;border:1px dashed currentColor;border-radius:8px">Comment wall appears here for visitors</div>',
      )
      .replaceAll(
        "__PHOTO_ALBUM__",
        '<div style="opacity:0.5;font-style:italic;padding:1rem;text-align:center;border:1px dashed currentColor;border-radius:8px">Photo album + upload form appears here for visitors</div>',
      )
      .replaceAll(
        "__RSVP_COUNT__",
        '<span style="opacity:0.55;font-style:italic">0 yes so far (preview)</span>',
      )
      .replaceAll("__RSVP_YES__", "0")
      .replaceAll("__RSVP_MAYBE__", "0")
      .replaceAll("__RSVP_NO__", "0");
  }

  // After previewClean, scan for any remaining __FOO__ placeholders
  // that Claude invented but the server doesn't know about. Surface
  // them as a yellow warning under the iframe so the user notices.
  const [unresolvedPlaceholders, setUnresolvedPlaceholders] = useState<string[]>([]);
  function scanUnresolved(html: string) {
    const matches = html.match(/__[A-Z][A-Z0-9_]+__/g) ?? [];
    const unique = Array.from(new Set(matches));
    setUnresolvedPlaceholders(unique);
  }

  // Server-side validator reports missing MUST-HAVE features (e.g.
  // "Missing countdown row"). Surface them as a Polish button that
  // re-runs the generator with a targeted fix-up prompt.
  const [validationIssues, setValidationIssues] = useState<
    Array<{ key: string; label: string }>
  >([]);
  const [polishing, setPolishing] = useState(false);

  async function exportRsvpsCsv() {
    if (!siteId) return;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session?.access_token ?? SUPABASE_KEY}`,
    };
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-site-rsvps-export`, {
      method: "POST",
      headers,
      body: JSON.stringify({ site_id: siteId }),
    });
    if (!res.ok) {
      setError("Couldn't export RSVPs.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug ?? "site"}-rsvps.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Polish: take the validation issues the server flagged and ask
  // Claude to add the missing features. Runs the edit flow with a
  // synthetic prompt that names exactly what's missing.
  async function polish() {
    if (!siteId || !validationIssues.length || polishing) return;
    setPolishing(true);
    setLoading(true);
    try {
      const wishlist = validationIssues
        .map((iss) => `- ${iss.label}`)
        .join("\n");
      const polishPrompt =
        "Polish pass — add the missing MUST-HAVE features per the design bible. Don't redesign, don't shrink, just add what's missing:\n" +
        wishlist +
        "\nReturn the full site with these added.";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${session?.access_token ?? SUPABASE_KEY}`,
      };
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-site-generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt: polishPrompt, edit_site_id: siteId }),
      });
      if (!res.ok || !res.body) {
        setError("Polish failed. Try again.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let bufferedHtml = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const evt of events) {
          for (const line of evt.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data?.type === "chunk" && typeof data.text === "string") {
                bufferedHtml += data.text;
              } else if (data?.type === "done") {
                if (iframeRef.current?.contentDocument) {
                  const doc = iframeRef.current.contentDocument;
                  doc.open();
                  doc.write(previewClean(bufferedHtml));
                  doc.close();
                }
                scanUnresolved(bufferedHtml);
                setValidationIssues(
                  Array.isArray(data.validation?.issues)
                    ? data.validation.issues
                    : [],
                );
                if (typeof data.version_number === "number") {
                  setEditCount(data.version_number);
                }
                setConversation((c) => [
                  ...c,
                  { role: "user", content: "polish" },
                  {
                    role: "assistant",
                    content: "Added the missing features. Tell me what else to change.",
                  },
                ]);
              }
            } catch { /* keepalive */ }
          }
        }
      }
    } finally {
      setPolishing(false);
      setLoading(false);
    }
  }

  // Moderation modal: fetch messages + photos for owner review.
  // Owner can hide (approved=false) or delete via inline buttons.
  async function openModeration() {
    if (!siteId) return;
    setModOpen(true);
    setModBusy(true);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session?.access_token ?? SUPABASE_KEY}`,
    };
    try {
      const [mres, pres] = await Promise.all([
        fetch(`${SUPABASE_URL}/functions/v1/ai-site-messages`, {
          method: "POST",
          headers,
          body: JSON.stringify({ site_id: siteId, action: "list" }),
        }),
        fetch(`${SUPABASE_URL}/functions/v1/ai-site-photos`, {
          method: "POST",
          headers,
          body: JSON.stringify({ site_id: siteId, action: "list" }),
        }),
      ]);
      const mbody = await mres.json().catch(() => ({}));
      const pbody = await pres.json().catch(() => ({}));
      setModMessages(Array.isArray(mbody?.messages) ? mbody.messages : []);
      setModPhotos(Array.isArray(pbody?.photos) ? pbody.photos : []);
    } finally {
      setModBusy(false);
    }
  }

  async function moderateMessage(
    messageId: string,
    action: "approve" | "hide" | "delete",
  ) {
    if (!siteId) return;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session?.access_token ?? SUPABASE_KEY}`,
    };
    const body =
      action === "delete"
        ? { site_id: siteId, action: "delete", message_id: messageId }
        : { site_id: siteId, action: "moderate", message_id: messageId, approved: action === "approve" };
    await fetch(`${SUPABASE_URL}/functions/v1/ai-site-messages`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (action === "delete") {
      setModMessages((rows) => rows.filter((r) => r.id !== messageId));
    } else {
      setModMessages((rows) =>
        rows.map((r) =>
          r.id === messageId ? { ...r, approved: action === "approve" } : r,
        ),
      );
    }
  }

  async function moderatePhoto(
    photoId: string,
    action: "approve" | "hide" | "delete",
  ) {
    if (!siteId) return;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session?.access_token ?? SUPABASE_KEY}`,
    };
    const body =
      action === "delete"
        ? { site_id: siteId, action: "delete", photo_id: photoId }
        : { site_id: siteId, action: "moderate", photo_id: photoId, approved: action === "approve" };
    await fetch(`${SUPABASE_URL}/functions/v1/ai-site-photos`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (action === "delete") {
      setModPhotos((rows) => rows.filter((r) => r.id !== photoId));
    } else {
      setModPhotos((rows) =>
        rows.map((r) =>
          r.id === photoId ? { ...r, approved: action === "approve" } : r,
        ),
      );
    }
  }

  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variantsOpen, setVariantsOpen] = useState(false);
  const [variants, setVariants] = useState<
    Array<{ site_id: string; slug: string; title: string; html: string; label: string }>
  >([]);
  const [variantProgress, setVariantProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  // Fire ai-site-generate once with a prompt+seed, fully consume the
  // SSE stream, return the final HTML + slug + title.
  async function generateOne(prompt: string): Promise<{
    site_id: string;
    slug: string;
    title: string;
    html: string;
  } | null> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session?.access_token ?? SUPABASE_KEY}`,
    };
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-site-generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok || !res.body) return null;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let bufferedHtml = "";
      let done_evt: any = null;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const evt of events) {
          for (const line of evt.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data?.type === "chunk" && typeof data.text === "string") {
                bufferedHtml += data.text;
              } else if (data?.type === "done") {
                done_evt = data;
              }
            } catch { /* keepalive */ }
          }
        }
      }
      if (!done_evt) return null;
      return {
        site_id: String(done_evt.site_id ?? ""),
        slug: String(done_evt.slug ?? ""),
        title: String(done_evt.title ?? "Untitled"),
        html: bufferedHtml,
      };
    } catch {
      return null;
    }
  }

  async function generateVariants() {
    const lastUserMessage = [...conversation].reverse().find((m) => m.role === "user")?.content?.trim();
    if (!lastUserMessage || variantsLoading) return;
    setVariantsLoading(true);
    setVariantProgress({ done: 0, total: 3 });

    // 3 prompt variations seeded with different style hints so Claude
    // produces visibly distinct takes (not 3 near-identical copies).
    const seeds = [
      { label: "Classic", suffix: "" },
      { label: "Editorial", suffix: " — use a magazine / editorial treatment with bold tracked typography." },
      { label: "Playful", suffix: " — make it a touch more playful / softer, lean into hand-drawn warmth." },
    ];
    const results: typeof variants = [];
    await Promise.all(
      seeds.map(async (seed) => {
        const result = await generateOne(lastUserMessage + seed.suffix);
        if (result) results.push({ ...result, label: seed.label });
        setVariantProgress((p) => ({ ...p, done: p.done + 1 }));
      }),
    );
    setVariants(results);
    setVariantsLoading(false);
    if (results.length > 0) setVariantsOpen(true);
    else setError("Couldn't generate variants. Try again.");
  }

  function pickVariant(v: { site_id: string; slug: string; title: string; html: string }) {
    setSiteId(v.site_id);
    setSlug(v.slug);
    setTitle(v.title);
    setHasContent(true);
    const iframe = iframeRef.current;
    if (iframe?.contentDocument) {
      const doc = iframe.contentDocument;
      doc.open();
      doc.write(previewClean(v.html));
      scanUnresolved(v.html);
      doc.close();
    }
    // Block the unpicked variants so they're hidden from public access.
    // We don't hard-delete (preserves accidental re-discovery) — just
    // flip is_blocked = true and let a future cleanup cron sweep them.
    const losers = variants.filter((x) => x.site_id !== v.site_id);
    for (const loser of losers) {
      (sb.from("ai_sites") as any)
        .update({ is_blocked: true })
        .eq("id", loser.site_id)
        .then(() => undefined, () => undefined);
    }
    setVariantsOpen(false);
    setVariants([]);
    setSearchParams({ site: v.site_id });
    setConversation((prev) => [
      ...prev,
      { role: "assistant", content: `Locked in the "${v.title}" variant — let's keep going from here.` },
    ]);
  }

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<any>(null);

  // Voice input via Web Speech API. Falls back gracefully on browsers
  // that don't expose webkitSpeechRecognition / SpeechRecognition.
  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const W: any = window;
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) {
      setError("Voice input isn't supported in this browser. Try Chrome or Safari.");
      return;
    }
    try {
      const rec = new Ctor();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = "en-US";
      rec.onresult = (e: any) => {
        let transcript = "";
        for (let i = 0; i < e.results.length; i++) {
          transcript += e.results[i][0].transcript;
        }
        setInput((prev) => (prev ? prev + " " : "") + transcript.trim());
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);
      rec.start();
      recognitionRef.current = rec;
      setListening(true);
      setError(null);
    } catch (e) {
      console.error("speech recognition failed", e);
      setError("Couldn't start voice input.");
      setListening(false);
    }
  }

  async function openVersions() {
    if (!siteId) return;
    setVersionsOpen(true);
    setVersionsBusy(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${session?.access_token ?? SUPABASE_KEY}`,
      };
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-site-versions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ site_id: siteId, action: "list" }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(body?.versions)) {
        setVersions(body.versions);
      } else {
        setVersions([]);
      }
    } finally {
      setVersionsBusy(false);
    }
  }

  async function openGuests() {
    if (!siteId) return;
    setGuestsOpen(true);
    setGuestsBusy(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${session?.access_token ?? SUPABASE_KEY}`,
      };
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-site-guests`, {
        method: "POST",
        headers,
        body: JSON.stringify({ site_id: siteId, action: "list" }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(body?.guests)) setGuests(body.guests);
      else setGuests([]);
    } finally {
      setGuestsBusy(false);
    }
  }

  async function importGuests() {
    if (!siteId || !guestImport.trim() || guestsBusy) return;
    // Parse pasted text: one guest per line, "Name, email" or just "Name".
    const lines = guestImport.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const parsed = lines.map((l) => {
      const m = l.match(/^([^,]+?)\s*[,;]\s*(\S+@\S+)/);
      if (m) return { name: m[1].trim(), email: m[2].trim() };
      return { name: l, email: undefined };
    });
    if (parsed.length === 0) return;
    setGuestsBusy(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${session?.access_token ?? SUPABASE_KEY}`,
      };
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-site-guests`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          site_id: siteId,
          action: "bulk_create",
          guests: parsed,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(body?.guests)) {
        setGuests((prev) => [...prev, ...body.guests]);
        setGuestImport("");
      } else {
        setError(body?.error ?? "Couldn't import guests.");
      }
    } finally {
      setGuestsBusy(false);
    }
  }

  async function deleteGuest(guestId: string) {
    if (!siteId) return;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session?.access_token ?? SUPABASE_KEY}`,
    };
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-site-guests`, {
      method: "POST",
      headers,
      body: JSON.stringify({ site_id: siteId, action: "delete", guest_id: guestId }),
    });
    if (res.ok) setGuests((prev) => prev.filter((g) => g.id !== guestId));
  }

  async function togglePlusOne(guestId: string, current: boolean) {
    if (!siteId) return;
    // Optimistic update; rollback on failure.
    setGuests((prev) =>
      prev.map((g) => (g.id === guestId ? { ...g, plus_one_allowed: !current } : g)),
    );
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-site-guests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${session?.access_token ?? SUPABASE_KEY}`,
      },
      body: JSON.stringify({
        site_id: siteId,
        action: "toggle_plus_one",
        guest_id: guestId,
        allowed: !current,
      }),
    });
    if (!res.ok) {
      setGuests((prev) =>
        prev.map((g) => (g.id === guestId ? { ...g, plus_one_allowed: current } : g)),
      );
    }
  }

  function copyGuestLink(token: string) {
    if (!slug) return;
    const link = `${window.location.origin}/s/${slug}?g=${token}`;
    navigator.clipboard?.writeText(link).then(() => {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 1500);
    });
  }

  async function restoreVersion(versionNumber: number) {
    if (!siteId || restoreBusy !== null) return;
    setRestoreBusy(versionNumber);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${session?.access_token ?? SUPABASE_KEY}`,
      };
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-site-versions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          site_id: siteId,
          action: "restore",
          version_number: versionNumber,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.html && iframeRef.current) {
        const doc = iframeRef.current.contentDocument;
        if (doc) {
          doc.open();
          doc.write(previewClean(body.html as string));
          doc.close();
        }
        scanUnresolved(body.html as string);
        setTitle(body.title ?? title);
        setHasContent(true);
        setVersionsOpen(false);
        setConversation((prev) => [
          ...prev,
          { role: "user", content: `restore version ${versionNumber}` },
          { role: "assistant", content: `Reverted to version ${versionNumber}.` },
        ]);
      } else {
        setError(body?.error ?? "Couldn't restore that version.");
      }
    } finally {
      setRestoreBusy(null);
    }
  }

  useEffect(() => {
    inputRef.current?.focus();
    return () => abortRef.current?.abort();
  }, []);

  // Resume editing flow — if ?site=<id> is in the URL, fetch the
  // existing site, hydrate state, and write its HTML into the iframe
  // so the user picks up where they left off.
  useEffect(() => {
    if (!resumeSiteId) return;
    let cancelled = false;
    (async () => {
      const { data, error: loadErr } = await sb
        .from("ai_sites")
        .select("id, slug, title, html, owner_user_id")
        .eq("id", resumeSiteId)
        .maybeSingle();
      if (cancelled) return;
      const row = data as
        | { id: string; slug: string; title: string; html: string; owner_user_id: string | null }
        | null;
      if (loadErr || !row) {
        setError("Couldn't load that site.");
        // Clear the bad query param.
        searchParams.delete("site");
        setSearchParams(searchParams, { replace: true });
        return;
      }
      if (row.owner_user_id && row.owner_user_id !== session?.user?.id) {
        setError("That site belongs to someone else.");
        return;
      }
      setSiteId(row.id);
      setSlug(row.slug);
      setTitle(row.title);
      setHasContent(true);
      setConversation([
        {
          role: "assistant",
          content: `Resumed "${row.title}". Tell me what to change.`,
        },
      ]);
      // Write the saved HTML into the iframe doc.
      const iframe = iframeRef.current;
      if (iframe?.contentDocument) {
        const doc = iframe.contentDocument;
        doc.open();
        doc.write(previewClean(row.html));
        doc.close();
      }
      scanUnresolved(row.html);
    })();
    return () => {
      cancelled = true;
    };
    // session?.user?.id intentionally included — if the user signs in
    // mid-page we recheck ownership.
  }, [resumeSiteId, session?.user?.id, searchParams, setSearchParams]);

  const publicUrl =
    slug && typeof window !== "undefined"
      ? `${window.location.origin}/s/${slug}`
      : null;

  const ownsSite = !!(session?.user?.id && siteId);

  function resetIframe(): Document | null {
    const iframe = iframeRef.current;
    if (!iframe) return null;
    const doc = iframe.contentDocument;
    if (!doc) return null;
    doc.open();
    return doc;
  }

  // Detect "undo / revert / go back" intent in the user's message
  // so we can route to ai-site-revert instead of burning another
  // AI call. Tight regex — only matches the explicit forms.
  function isUndoIntent(text: string): boolean {
    const t = text.trim().toLowerCase();
    if (
      t === "undo" ||
      t === "revert" ||
      t === "go back" ||
      t === "back" ||
      t === "previous" ||
      t === "rollback"
    ) {
      return true;
    }
    if (/^(undo|revert|go back|rollback)\b/.test(t)) return true;
    if (/^(take|go) (me )?back\b/.test(t)) return true;
    if (/^(previous|last) (version|edit|change)\b/.test(t)) return true;
    if (/^(restore|bring back) (the )?(previous|last|earlier)\b/.test(t)) return true;
    return false;
  }

  async function revertOneStep() {
    if (!siteId || loading) return;
    setError(null);
    setLoading(true);
    try {
      const accessToken = session?.access_token ?? SUPABASE_KEY;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-site-revert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_KEY,
        },
        body: JSON.stringify({ site_id: siteId }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 400 && body?.error === "nothing_to_undo") {
        setConversation((c) => [
          ...c,
          { role: "user", content: "undo" },
          { role: "assistant", content: "Nothing earlier to undo to — this is the first version." },
        ]);
        return;
      }
      if (!res.ok || !body?.html) {
        const errMap: Record<string, string> = {
          not_owner: "Only the site owner can undo.",
          site_not_found: "Site not found.",
        };
        setError(errMap[body?.error ?? ""] ?? "Couldn't undo.");
        return;
      }
      const iframe = iframeRef.current;
      if (iframe?.contentDocument) {
        const doc = iframe.contentDocument;
        doc.open();
        doc.write(previewClean(body.html as string));
        doc.close();
      }
      scanUnresolved(body.html as string);
      setTitle(body.title as string);
      setHasContent(true);
      setConversation((c) => [
        ...c,
        { role: "user", content: "undo" },
        { role: "assistant", content: `Reverted to the previous version of "${body.title ?? "your site"}".` },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Undo failed");
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  async function uploadPendingImage(): Promise<string | null> {
    if (!pendingImage || !siteId) return null;
    const accessToken = session?.access_token ?? SUPABASE_KEY;
    const form = new FormData();
    form.append("site_id", siteId);
    form.append("image", pendingImage);
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/ai-site-image-upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_KEY,
        },
        body: form,
      },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.image_url) {
      const errMap: Record<string, string> = {
        image_too_large: "Image is over 12MB — please pick something smaller.",
        unsupported_image_type: "Only JPG, PNG, WebP, GIF, or HEIC images.",
        empty_image: "That image looks empty.",
        not_owner: "Only the site owner can attach photos.",
      };
      throw new Error(errMap[body?.error ?? ""] ?? "Couldn't upload that image.");
    }
    return body.image_url as string;
  }

  async function submit(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed && !pendingImage) return;
    if (loading) return;

    // Route undo intent to the revert endpoint — never burn an AI
    // call for "undo".
    if (siteId && !pendingImage && isUndoIntent(trimmed)) {
      setInput("");
      void revertOneStep();
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setError(null);
    setLoading(true);

    // Upload the pending image first (if any) so its URL can be
    // included in the prompt going to Claude. Bail out cleanly if
    // upload fails — user keeps the chip and can retry.
    let imageUrl: string | null = null;
    if (pendingImage) {
      if (!siteId) {
        setLoading(false);
        setError("Generate a site first, then attach photos to refine it.");
        return;
      }
      try {
        imageUrl = await uploadPendingImage();
      } catch (e) {
        setLoading(false);
        setError(e instanceof Error ? e.message : "Upload failed");
        return;
      }
      setPendingImage(null);
    }

    const userVisibleMessage = trimmed || "Use this photo as the hero.";
    const promptForAi = imageUrl
      ? `${userVisibleMessage}\n\n(Attached photo — please use it where the request mentions: ${imageUrl})`
      : trimmed;

    const prevConv = conversation;
    const nextConv: ChatMessage[] = [
      ...prevConv,
      {
        role: "user",
        content: imageUrl
          ? `📎 photo attached — ${userVisibleMessage}`
          : trimmed,
      },
    ];
    setConversation(nextConv);
    setInput("");

    // Don't reset the iframe yet — we buffer the streamed HTML and
    // only write it to the iframe after the "done" event arrives.
    // (Live progressive rendering looked ugly during stream — layout
    // shifts, half-loaded fonts, partial scrollbars.)
    setHasContent(true);

    let receivedChunk = false;
    let bufferedHtml = "";
    let buf = "";

    try {
      const accessToken = session?.access_token ?? SUPABASE_KEY;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-site-generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_KEY,
        },
        body: JSON.stringify({
          prompt: promptForAi,
          conversation: prevConv,
          edit_site_id: siteId,
        }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`http_${res.status}${errBody ? `: ${errBody.slice(0, 200)}` : ""}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const evt of events) {
          for (const line of evt.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            let data: {
              type: string;
              text?: string;
              slug?: string;
              title?: string;
              site_id?: string;
              message?: string;
              version_number?: number;
              validation?: { ok: boolean; issues: Array<{ key: string; label: string }> };
            };
            try {
              data = JSON.parse(line.slice(6));
            } catch {
              continue;
            }
            if (data.type === "chunk" && data.text) {
              // Buffer rather than write directly to iframe — only
              // render after "done".
              const text = receivedChunk
                ? data.text
                : data.text.replace(/<!--\s*TITLE:[^>]*-->\s*/i, "");
              receivedChunk = true;
              bufferedHtml += text;
            } else if (data.type === "done") {
              // Stream finished. Write the entire buffered HTML to
              // the iframe at once so the user sees a complete,
              // polished render — no in-flight layout shifts or
              // half-loaded fonts.
              const iframe = iframeRef.current;
              if (iframe?.contentDocument) {
                const doc = iframe.contentDocument;
                doc.open();
                doc.write(previewClean(bufferedHtml));
                scanUnresolved(bufferedHtml);
                doc.close();
              }
              if (data.site_id) setSiteId(data.site_id);
              setSlug(data.slug ?? null);
              setTitle(data.title ?? null);
              if (typeof data.version_number === "number") {
                setEditCount(data.version_number);
              }
              // Surface server-side validation issues so the user can
              // hit Polish and request a targeted fix-up.
              setValidationIssues(
                Array.isArray(data.validation?.issues)
                  ? data.validation.issues
                  : [],
              );
              // Sync the streamed iframe's RSVP form action with the
              // real slug — Claude sometimes invents one in the
              // streamed bytes; the DB row is already corrected
              // server-side. Without this fix-up, a user testing the
              // form in the builder iframe would POST to the wrong
              // slug.
              if (data.slug && iframeRef.current?.contentDocument) {
                const realSlug = data.slug;
                iframeRef.current.contentDocument
                  .querySelectorAll('form[action*="ai-site-rsvp-submit"]')
                  .forEach((form) => {
                    const action = (form as HTMLFormElement).getAttribute("action");
                    if (action) {
                      const fixed = action.replace(
                        /([?&]slug=)[^"'&\s]*/,
                        `$1${realSlug}`,
                      );
                      (form as HTMLFormElement).setAttribute("action", fixed);
                    }
                  });
              }
              const verb = siteId ? "Updated" : "Built";
              setConversation([
                ...nextConv,
                {
                  role: "assistant",
                  content: `${verb} "${data.title ?? "your site"}". Tell me what else to change.`,
                },
              ]);
            } else if (data.type === "error") {
              throw new Error(data.message ?? "generation_failed");
            }
          }
        }
      }
      // If the stream ended without a `done` event, dump the
      // accumulated buffer into the iframe so the user sees
      // *something* instead of an empty preview.
      if (bufferedHtml && iframeRef.current?.contentDocument) {
        const fallbackDoc = iframeRef.current.contentDocument;
        try {
          fallbackDoc.open();
          fallbackDoc.write(bufferedHtml);
          fallbackDoc.close();
        } catch {
          // ignore
        }
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      // Hide the iframe again on failure so the user doesn't see
      // a stale half-rendered preview.
      if (!receivedChunk) setHasContent(false);
      try {
        // best-effort close; iframe may not have an open doc
        iframeRef.current?.contentDocument?.close();
      } catch {
        // ignore
      }
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setError(msg);
      setConversation(prevConv);
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  }

  async function copyUrl() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
    } catch {
      // older browsers — URL still on screen
    }
  }

  async function startNewSite() {
    abortRef.current?.abort();
    setConversation([]);
    setSiteId(null);
    setSlug(null);
    setTitle(null);
    setHasContent(false);
    setError(null);
    setRenameOpen(false);
    if (searchParams.get("site")) {
      searchParams.delete("site");
      setSearchParams(searchParams, { replace: true });
    }
    const doc = resetIframe();
    try {
      doc?.close();
    } catch {
      // ignore
    }
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function generateHeroImage() {
    if (!siteId || !imagePrompt.trim() || imageBusy) return;
    setImageBusy(true);
    setImageError(null);
    try {
      const accessToken = session?.access_token ?? SUPABASE_KEY;
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/ai-site-image-generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: SUPABASE_KEY,
          },
          body: JSON.stringify({
            site_id: siteId,
            prompt: imagePrompt.trim(),
          }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.image_url) {
        const errMap: Record<string, string> = {
          content_blocked: "That prompt was blocked. Try a different idea.",
          blocked_content: "That prompt was blocked. Try a different idea.",
          openai_no_image: "OpenAI didn't return an image — try again.",
          openai_key_missing: "Image service isn't configured.",
        };
        setImageError(
          errMap[body?.error ?? ""] ??
            "Couldn't generate that image. Try a different prompt.",
        );
        return;
      }
      const url = body.image_url as string;
      const userInstruction = imagePrompt.trim();
      setImageModalOpen(false);
      setImagePrompt("");
      // Hand off to the edit pipeline so Claude swaps the hero in.
      void submit(
        `Replace the hero image with this URL: ${url}\n(Originally requested: ${userInstruction})`,
      );
    } catch (e) {
      setImageError(e instanceof Error ? e.message : "Image generation failed");
    } finally {
      setImageBusy(false);
    }
  }

  async function renameSlug() {
    if (!siteId || !renameValue.trim() || renameBusy) return;
    setRenameBusy(true);
    setRenameError(null);
    try {
      const { data, error: rpcErr } = await sb.rpc("ai_sites_rename", {
        p_site_id: siteId,
        p_new_slug: renameValue.trim(),
      });
      if (rpcErr) {
        setRenameError(rpcErr.message ?? "rename_failed");
        return;
      }
      const result = data as { ok: boolean; slug?: string; error?: string } | null;
      if (!result?.ok) {
        const errMap: Record<string, string> = {
          auth_required: "Sign in to rename.",
          not_owner: "Only the site owner can rename.",
          invalid_length: "Slug must be 3–50 characters.",
          reserved: "That slug is reserved.",
          slug_taken: "Already taken — try another.",
        };
        setRenameError(errMap[result?.error ?? ""] ?? "Couldn't rename.");
        return;
      }
      setSlug(result.slug!);
      setRenameOpen(false);
      setRenameValue("");
    } finally {
      setRenameBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0b] text-white">
      <header className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 gap-3 flex-wrap">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-3">
            <VendoraLogo size="sm" color="#fff" />
            <span className="text-[12px] uppercase tracking-[2px] text-white/50">
              Website builder
            </span>
          </Link>
          {siteId && (
            <button
              onClick={startNewSite}
              className="text-[12px] text-white/60 hover:text-white border border-white/15 rounded-full px-3 py-1 transition-colors"
            >
              + New site
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {session && (
            <Link
              to="/my-sites"
              className="text-[12px] text-white/70 hover:text-white transition-colors"
            >
              My sites
            </Link>
          )}
          {!session && publicUrl && (
            <Link
              to="/login"
              className="text-[12px] text-white/70 hover:text-white border border-white/15 rounded-full px-3 py-1 transition-colors"
            >
              Sign in to save
            </Link>
          )}
          {publicUrl && (
            <>
              {siteId && (
                <button
                  onClick={() => {
                    setImageModalOpen(true);
                    setImagePrompt("");
                    setImageError(null);
                  }}
                  disabled={loading}
                  className="text-[12px] text-white/70 hover:text-white border border-white/15 rounded-full px-3 py-1 transition-colors disabled:opacity-40"
                  title="Generate a custom hero image with AI"
                >
                  ✨ Hero image
                </button>
              )}
              {ownsSite && !renameOpen && (
                <button
                  onClick={() => {
                    setRenameOpen(true);
                    setRenameValue(slug ?? "");
                    setRenameError(null);
                  }}
                  className="text-[12px] text-white/70 hover:text-white border border-white/15 rounded-full px-3 py-1 transition-colors"
                  title="Rename slug"
                >
                  Rename
                </button>
              )}
              {siteId && (
                <button
                  onClick={openVersions}
                  disabled={loading}
                  className="text-[12px] text-white/70 hover:text-white border border-white/15 rounded-full px-3 py-1 transition-colors disabled:opacity-40"
                  title="View past versions and restore"
                >
                  History
                </button>
              )}
              {siteId && (
                <button
                  onClick={openGuests}
                  disabled={loading}
                  className="text-[12px] text-white/70 hover:text-white border border-white/15 rounded-full px-3 py-1 transition-colors disabled:opacity-40"
                  title="Invite guests with personalized links"
                >
                  Guests
                </button>
              )}
              {siteId && (
                <button
                  onClick={openModeration}
                  disabled={loading}
                  className="text-[12px] text-white/70 hover:text-white border border-white/15 rounded-full px-3 py-1 transition-colors disabled:opacity-40"
                  title="Review guest messages and photos"
                >
                  Moderate
                </button>
              )}
              {siteId && (
                <button
                  onClick={exportRsvpsCsv}
                  disabled={loading}
                  className="text-[12px] text-white/70 hover:text-white border border-white/15 rounded-full px-3 py-1 transition-colors disabled:opacity-40"
                  title="Download RSVPs as CSV"
                >
                  ⬇ RSVPs
                </button>
              )}
              {ownsSite && renameOpen ? (
                <div className="flex items-center gap-2 bg-white/5 border border-white/20 rounded-full pl-3 pr-1.5 py-1">
                  <span className="text-[12px] text-white/40">/s/</span>
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) =>
                      setRenameValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") renameSlug();
                      if (e.key === "Escape") setRenameOpen(false);
                    }}
                    className="bg-transparent text-[12px] text-white outline-none w-44"
                    placeholder="my-event-slug"
                    disabled={renameBusy}
                  />
                  <button
                    onClick={renameSlug}
                    disabled={renameBusy || !renameValue.trim()}
                    className="text-[11px] bg-white text-black px-2.5 py-1 rounded-full disabled:opacity-40"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setRenameOpen(false)}
                    className="text-[11px] text-white/50 px-1.5"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <code className="text-[12px] text-white/70 bg-white/5 px-3 py-1.5 rounded-full border border-white/10 max-w-[320px] truncate">
                  {publicUrl}
                </code>
              )}
              {renameError && (
                <span className="text-[11px] text-red-400">{renameError}</span>
              )}
              <button
                onClick={copyUrl}
                className="text-[12px] bg-white text-black px-4 py-1.5 rounded-full hover:bg-white/90 transition-colors"
              >
                Copy link
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-[12px] border border-white/20 px-4 py-1.5 rounded-full hover:bg-white/10 transition-colors"
              >
                Open
              </a>
            </>
          )}
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Chat pane */}
        <aside className="w-full md:w-[400px] md:min-w-[360px] max-h-[50vh] md:max-h-none border-b md:border-b-0 md:border-r border-white/10 flex flex-col bg-[#0c0c0e]">
          <div className="flex-1 overflow-y-auto px-5 py-6 space-y-4">
            {conversation.length === 0 && !loading && (
              <div className="space-y-5">
                <div>
                  <div className="text-[20px] font-medium leading-tight">
                    Hey, I'm your site designer.
                  </div>
                  <div className="text-[14px] text-white/60 mt-2 leading-relaxed">
                    Tell me what kind of event site you want. I'll make
                    it pretty — and add an RSVP form so guests can reply.
                    Then tell me what to tweak.
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-[2px] text-white/40">
                    Try
                  </div>
                  {EXAMPLE_PROMPTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => submit(p)}
                      className="block w-full text-left text-[13px] leading-relaxed text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl px-4 py-3 transition-colors"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {conversation.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[85%] bg-white text-black rounded-2xl rounded-br-md px-4 py-2.5 text-[14px] leading-relaxed"
                    : "mr-auto max-w-[85%] bg-white/5 border border-white/10 rounded-2xl rounded-bl-md px-4 py-2.5 text-[14px] leading-relaxed text-white/90"
                }
              >
                {m.content}
              </div>
            ))}

            {loading && (
              <div className="mr-auto max-w-[85%] bg-white/5 border border-white/10 rounded-2xl rounded-bl-md px-4 py-3 text-[14px] text-white/60 inline-flex items-center gap-2">
                <span className="builder-dot" />
                <span className="builder-dot" />
                <span className="builder-dot" />
                <span className="ml-2">
                  {siteId ? "Updating your site…" : "Designing your site…"}
                </span>
              </div>
            )}

            {error && (
              <div className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                {error}
              </div>
            )}
          </div>

          {variantsLoading && (
            <div className="px-3 py-2 bg-violet-500/10 border-t border-violet-500/30 text-[12px] text-violet-200 flex items-center gap-2">
              <span className="builder-dot" />
              <span>
                Generating 3 variants… {variantProgress.done}/{variantProgress.total} done. ~60–90s.
              </span>
            </div>
          )}

          <div className={`p-3 bg-[#0a0a0b] ${siteId && !loading ? "" : "border-t border-white/10"}`}>
            {siteId && editCount > 0 && (
              <div className="flex items-center justify-between text-[10px] text-white/30 mb-2 px-1">
                <span>
                  {editCount} {editCount === 1 ? "edit" : "edits"} · ~${(editCount * 0.04).toFixed(2)} this site
                </span>
                <span className="text-white/40">claude-sonnet-4-6</span>
              </div>
            )}
            {pendingImage && (
              <div className="mb-2 inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full pl-3 pr-1.5 py-1 text-[12px] text-white/80 max-w-full">
                <span className="text-[14px]">📎</span>
                <span className="truncate max-w-[200px]">{pendingImage.name}</span>
                <span className="text-white/40">
                  {(pendingImage.size / 1024 / 1024).toFixed(1)} MB
                </span>
                <button
                  onClick={() => setPendingImage(null)}
                  disabled={loading}
                  className="ml-1 w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-[11px] disabled:opacity-30"
                  aria-label="Remove attached image"
                >
                  ×
                </button>
              </div>
            )}
            <div className="relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={loading}
                rows={2}
                placeholder={
                  conversation.length === 0
                    ? "Describe your event…"
                    : pendingImage
                      ? "Where should this photo go? e.g. 'use as hero'"
                      : "Tweak it, attach a photo, or type 'undo'…"
                }
                className="w-full resize-none bg-white/5 border border-white/10 rounded-2xl pl-11 pr-12 py-3 text-[14px] text-white placeholder:text-white/40 focus:outline-none focus:border-white/30 disabled:opacity-50"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 12 * 1024 * 1024) {
                      setError("That image is over 12MB.");
                      return;
                    }
                    setPendingImage(file);
                    setError(null);
                  }
                  // Reset so re-picking the same file fires onChange.
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || !siteId}
                aria-label="Attach a photo"
                title={siteId ? "Attach a photo" : "Generate a site first"}
                className="absolute left-2 bottom-2 w-8 h-8 rounded-full text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
                    stroke="currentColor"
                    strokeWidth="0"
                    fill="none"
                  />
                  <path
                    d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                onClick={toggleVoice}
                disabled={loading}
                aria-label={listening ? "Stop listening" : "Voice input"}
                title={listening ? "Stop listening" : "Describe your event by voice"}
                className={
                  "absolute left-11 bottom-2 w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed " +
                  (listening
                    ? "bg-red-500/20 text-red-300 ring-2 ring-red-400/60 animate-pulse"
                    : "text-white/60 hover:text-white hover:bg-white/10")
                }
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                onClick={generateVariants}
                disabled={loading || variantsLoading || !siteId || conversation.length === 0}
                aria-label="Generate 3 variants"
                title="Generate 3 design variations from your last prompt"
                className="absolute left-20 bottom-2 w-8 h-8 rounded-full text-violet-300/70 hover:text-violet-200 hover:bg-violet-500/15 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors text-[14px]"
              >
                🎲
              </button>
              <button
                onClick={() => {
                  const url = window.prompt(
                    "Paste a URL whose design you want to match (Claude will use its web_search tool to read it):",
                    "https://",
                  );
                  if (!url || !url.startsWith("http")) return;
                  submit(`Match the design vibe of this site: ${url}. Use the web_search tool to read it, then re-style my current invitation to match its palette, fonts, and overall feel — keeping all my content intact.`);
                }}
                disabled={loading || !siteId}
                aria-label="Match a URL"
                title="Match the design vibe of any URL"
                className="absolute left-[116px] bottom-2 w-8 h-8 rounded-full text-sky-300/70 hover:text-sky-200 hover:bg-sky-500/15 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors text-[14px]"
              >
                🔗
              </button>
              <button
                onClick={() => submit(input)}
                disabled={loading || (!input.trim() && !pendingImage)}
                aria-label="Send"
                className="absolute right-2 bottom-2 w-8 h-8 rounded-full bg-white text-black disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center hover:bg-white/90 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 19V5M5 12l7-7 7 7"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            {!session && siteId && (
              <div className="text-[11px] text-white/40 mt-2 px-1">
                <Link to="/login" className="underline hover:text-white/60">
                  Sign in
                </Link>{" "}
                to keep this site in your account and rename the URL.
              </div>
            )}
          </div>
        </aside>

        {/* Preview pane */}
        <main className="flex-1 bg-[#1a1a1c] flex items-center justify-center p-5 min-h-[60vh] relative">
          <iframe
            ref={iframeRef}
            title={title ?? "Site preview"}
            sandbox="allow-same-origin allow-forms"
            className="w-full h-full max-w-[1400px] rounded-xl shadow-2xl bg-white"
            style={{
              minHeight: "70vh",
              visibility: hasContent && !loading ? "visible" : "hidden",
            }}
          />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-center text-white/60 max-w-md mx-auto px-6 pointer-events-none">
              <div className="builder-preview-loader">
                <div className="text-[11px] uppercase tracking-[3px] text-white/40 mb-4">
                  Designing
                </div>
                <div className="builder-preview-mark">
                  <span className="builder-preview-letter">V</span>
                </div>
                <div className="text-[13px] text-white/50 mt-6 leading-relaxed">
                  Composing your invitation…
                  <br />
                  <span className="text-white/30">This usually takes about a minute.</span>
                </div>
              </div>
            </div>
          )}
          {!loading && !hasContent && (
            <div className="absolute inset-0 flex items-center justify-center text-center text-white/40 max-w-md mx-auto px-6 pointer-events-none">
              <div>
                <div className="text-[14px] uppercase tracking-[2px] mb-3">
                  Preview
                </div>
                <div className="text-[15px] leading-relaxed">
                  Your site will appear here once you describe it.
                </div>
              </div>
            </div>
          )}
          {hasContent && unresolvedPlaceholders.length > 0 && (
            <div
              className="absolute top-3 right-3 max-w-[320px] bg-amber-500/15 border border-amber-400/40 text-amber-100 text-[11px] px-3 py-1.5 rounded-full backdrop-blur"
              title="Claude wrote a placeholder the server doesn't know how to fill. Ask it to remove the placeholder or replace it with real content."
            >
              ⚠ Unresolved placeholder{unresolvedPlaceholders.length > 1 ? "s" : ""}: {unresolvedPlaceholders.join(", ")}
            </div>
          )}
          {hasContent && !loading && validationIssues.length > 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-[#0c0c0e]/90 border border-white/15 rounded-full pl-4 pr-1.5 py-1.5 backdrop-blur shadow-xl">
              <span className="text-[11px] text-white/70" title={validationIssues.map((i) => i.label).join("\n")}>
                {validationIssues.length} missing: {validationIssues.slice(0, 2).map((i) => i.label.replace(/^Missing\s+/, "")).join(", ")}{validationIssues.length > 2 ? "…" : ""}
              </span>
              <button
                onClick={polish}
                disabled={polishing || loading}
                className="text-[11px] font-medium bg-white/95 text-black rounded-full px-3 py-1 hover:bg-white transition-colors disabled:opacity-40"
                title={`Add: ${validationIssues.map((i) => i.label).join(", ")}`}
              >
                {polishing ? "Polishing…" : "✨ Polish"}
              </button>
            </div>
          )}
        </main>
      </div>

      {variantsOpen && variants.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setVariantsOpen(false)}
        >
          <div
            className="bg-[#0c0c0e] border border-white/15 rounded-2xl p-6 max-w-[1100px] w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[16px] font-medium mb-1">Pick a variant</div>
            <div className="text-[13px] text-white/50 mb-4 leading-relaxed">
              Three different takes on your prompt. Click "Use this one" to keep it; the others stay in
              your DB as orphans (no harm).
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {variants.map((v) => (
                <div
                  key={v.site_id}
                  className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col"
                >
                  <div className="text-[11px] text-violet-200/80 uppercase tracking-wider mb-1">
                    {v.label}
                  </div>
                  <div className="text-[14px] font-medium mb-2 truncate" title={v.title}>
                    {v.title}
                  </div>
                  <div className="aspect-[4/5] rounded-lg overflow-hidden bg-black border border-white/10 mb-3 relative">
                    <iframe
                      title={v.label}
                      srcDoc={v.html}
                      sandbox="allow-same-origin"
                      className="w-full h-full pointer-events-none"
                      style={{ transform: "scale(0.45)", transformOrigin: "top left", width: "222%", height: "222%" }}
                    />
                  </div>
                  <div className="flex gap-2 mt-auto">
                    <a
                      href={`/s/${v.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 text-[12px] text-center text-white/70 hover:text-white border border-white/15 rounded-full px-3 py-1.5 transition-colors"
                    >
                      Preview ↗
                    </a>
                    <button
                      onClick={() => pickVariant(v)}
                      className="flex-1 text-[12px] bg-white text-black rounded-full px-3 py-1.5 hover:bg-white/90 transition-colors"
                    >
                      Use this one
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end mt-4">
              <button
                onClick={() => setVariantsOpen(false)}
                className="text-[13px] text-white/60 hover:text-white px-3 py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {guestsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/70 backdrop-blur-sm"
          onClick={() => !guestsBusy && setGuestsOpen(false)}
        >
          <div
            className="bg-[#0c0c0e] border border-white/15 rounded-2xl p-6 max-w-[640px] w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[16px] font-medium mb-1">Guest list</div>
            <div className="text-[13px] text-white/50 mb-4 leading-relaxed">
              Each guest gets a unique link. The site will greet them by
              name. Paste names one per line — optionally "Name, email".
            </div>

            <textarea
              value={guestImport}
              onChange={(e) => setGuestImport(e.target.value)}
              rows={4}
              disabled={guestsBusy}
              placeholder={"Eleanor Vance\nMarcus Aldridge, marcus@example.com\nSophia Chen\n…"}
              className="w-full resize-none bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-[13px] text-white placeholder:text-white/40 focus:outline-none focus:border-white/30 disabled:opacity-50 mb-2 font-mono"
            />
            <div className="flex items-center justify-between mb-4">
              <div className="text-[11px] text-white/40">
                {guestImport.trim().split(/\r?\n/).filter((l) => l.trim()).length} to import
              </div>
              <button
                onClick={importGuests}
                disabled={guestsBusy || !guestImport.trim()}
                className="text-[12px] bg-white text-black rounded-full px-3 py-1.5 hover:bg-white/90 transition-colors disabled:opacity-40"
              >
                {guestsBusy ? "Importing…" : "Add to list"}
              </button>
            </div>

            <div className="text-[12px] text-white/40 uppercase tracking-wider mb-2">
              Invited ({guests.length})
            </div>
            {guests.length === 0 ? (
              <div className="text-[13px] text-white/50 py-4 text-center">
                No guests yet. Paste names above to begin.
              </div>
            ) : (
              <div className="space-y-2 mb-3">
                {guests.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-2.5"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-white/90 font-medium truncate">
                        {g.name}
                      </div>
                      {g.email && (
                        <div className="text-[11px] text-white/40 truncate">{g.email}</div>
                      )}
                    </div>
                    <button
                      onClick={() => togglePlusOne(g.id, !!g.plus_one_allowed)}
                      className={
                        "text-[11px] border rounded-full px-2.5 py-1 transition-colors " +
                        (g.plus_one_allowed
                          ? "text-amber-200 border-amber-400/30 bg-amber-500/10"
                          : "text-white/55 border-white/15 hover:text-white")
                      }
                      title={g.plus_one_allowed ? "Plus-one allowed (click to disallow)" : "Allow plus-one"}
                    >
                      {g.plus_one_allowed ? "+1 ✓" : "+1"}
                    </button>
                    <button
                      onClick={() => copyGuestLink(g.token)}
                      className="text-[11px] text-white/70 hover:text-white border border-white/15 rounded-full px-2.5 py-1"
                      title={`/s/${slug}?g=${g.token}`}
                    >
                      {copiedToken === g.token ? "Copied!" : "Copy link"}
                    </button>
                    <button
                      onClick={() => deleteGuest(g.id)}
                      className="text-[11px] text-red-400 hover:text-red-300 px-1"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="text-[11px] text-white/40 mb-3 italic">
              Tip: tell Claude to add "__GUEST_BLOCK__" near the top of the
              site (e.g. "right above the couple names") so the greeting
              shows up when guests open their link.
            </div>

            <div className="flex items-center justify-end">
              <button
                onClick={() => setGuestsOpen(false)}
                disabled={guestsBusy}
                className="text-[13px] text-white/60 hover:text-white px-3 py-2 disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {modOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => !modBusy && setModOpen(false)}
        >
          <div
            className="bg-[#0c0c0e] border border-white/15 rounded-2xl p-6 max-w-[720px] w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-[18px] font-medium">Moderate guest activity</h2>
                <p className="text-[12px] text-white/50 mt-1">
                  Hide or delete anything your guests posted on the site.
                </p>
              </div>
              <button
                onClick={() => setModOpen(false)}
                className="text-white/40 hover:text-white text-[20px] leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="flex gap-1 mb-4 bg-white/5 p-1 rounded-full w-fit">
              <button
                onClick={() => setModTab("messages")}
                className={`text-[12px] px-3 py-1 rounded-full transition-colors ${
                  modTab === "messages"
                    ? "bg-white text-black"
                    : "text-white/60 hover:text-white"
                }`}
              >
                Messages ({modMessages.length})
              </button>
              <button
                onClick={() => setModTab("photos")}
                className={`text-[12px] px-3 py-1 rounded-full transition-colors ${
                  modTab === "photos"
                    ? "bg-white text-black"
                    : "text-white/60 hover:text-white"
                }`}
              >
                Photos ({modPhotos.length})
              </button>
            </div>

            {modBusy && (
              <div className="text-center text-white/40 text-[13px] py-8">
                Loading…
              </div>
            )}

            {!modBusy && modTab === "messages" && (
              <div className="space-y-2">
                {modMessages.length === 0 ? (
                  <div className="text-center text-white/40 text-[13px] py-8">
                    No messages yet.
                  </div>
                ) : (
                  modMessages.map((m) => (
                    <div
                      key={m.id}
                      className={`border rounded-xl p-3 ${
                        m.approved
                          ? "border-white/10 bg-white/[0.02]"
                          : "border-amber-400/30 bg-amber-500/[0.05]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-white">{m.name}</div>
                          <div className="text-[13px] text-white/70 whitespace-pre-wrap break-words mt-1">
                            {m.message}
                          </div>
                          <div className="text-[10px] text-white/40 mt-2">
                            {new Date(m.created_at).toLocaleString()} ·{" "}
                            {m.approved ? "live on site" : "hidden"}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 shrink-0">
                          {m.approved ? (
                            <button
                              onClick={() => moderateMessage(m.id, "hide")}
                              className="text-[11px] text-white/70 hover:text-white border border-white/20 rounded-full px-2.5 py-1"
                            >
                              Hide
                            </button>
                          ) : (
                            <button
                              onClick={() => moderateMessage(m.id, "approve")}
                              className="text-[11px] bg-white text-black rounded-full px-2.5 py-1 hover:bg-white/90"
                            >
                              Show
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (confirm("Delete this message permanently?")) {
                                moderateMessage(m.id, "delete");
                              }
                            }}
                            className="text-[11px] text-red-300/80 hover:text-red-200 border border-red-300/20 rounded-full px-2.5 py-1"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {!modBusy && modTab === "photos" && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {modPhotos.length === 0 ? (
                  <div className="col-span-full text-center text-white/40 text-[13px] py-8">
                    No photos yet.
                  </div>
                ) : (
                  modPhotos.map((p) => (
                    <div
                      key={p.id}
                      className={`relative rounded-xl overflow-hidden border ${
                        p.approved ? "border-white/10" : "border-amber-400/40 opacity-70"
                      }`}
                    >
                      <img
                        src={p.photo_url}
                        alt={p.caption ?? ""}
                        className="w-full h-32 object-cover bg-black/40"
                        loading="lazy"
                      />
                      {(p.uploader_name || p.caption) && (
                        <div className="px-2 py-1.5 text-[10px] text-white/70 bg-black/60">
                          {p.caption ? p.caption : ""}
                          {p.caption && p.uploader_name ? " — " : ""}
                          {p.uploader_name ? <em>{p.uploader_name}</em> : null}
                        </div>
                      )}
                      <div className="absolute top-1 right-1 flex flex-col gap-1">
                        {p.approved ? (
                          <button
                            onClick={() => moderatePhoto(p.id, "hide")}
                            className="text-[10px] bg-black/70 text-white border border-white/20 rounded-full px-2 py-0.5 hover:bg-black/90"
                          >
                            Hide
                          </button>
                        ) : (
                          <button
                            onClick={() => moderatePhoto(p.id, "approve")}
                            className="text-[10px] bg-white text-black rounded-full px-2 py-0.5 hover:bg-white/90"
                          >
                            Show
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm("Delete this photo permanently?")) {
                              moderatePhoto(p.id, "delete");
                            }
                          }}
                          className="text-[10px] bg-black/70 text-red-300 border border-red-300/30 rounded-full px-2 py-0.5 hover:bg-black/90"
                        >
                          Delete
                        </button>
                      </div>
                      {!p.approved && (
                        <div className="absolute top-1 left-1 text-[9px] uppercase tracking-wider bg-amber-500/80 text-black px-1.5 py-0.5 rounded">
                          Hidden
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {versionsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/70 backdrop-blur-sm"
          onClick={() => restoreBusy === null && setVersionsOpen(false)}
        >
          <div
            className="bg-[#0c0c0e] border border-white/15 rounded-2xl p-6 max-w-[520px] w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[16px] font-medium mb-1">Version history</div>
            <div className="text-[13px] text-white/50 mb-4 leading-relaxed">
              Every edit is snapshotted. Pick any version to restore it.
            </div>
            {versionsBusy ? (
              <div className="text-[13px] text-white/50 py-6 text-center">
                Loading…
              </div>
            ) : versions.length === 0 ? (
              <div className="text-[13px] text-white/50 py-6 text-center">
                No saved versions yet.
              </div>
            ) : (
              <div className="space-y-2">
                {versions.map((v) => (
                  <div
                    key={v.version_number}
                    className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-white/90 font-medium mb-0.5">
                        Version {v.version_number}
                      </div>
                      <div className="text-[12px] text-white/40 mb-1">
                        {new Date(v.created_at).toLocaleString()}
                      </div>
                      {v.prompt && (
                        <div className="text-[12px] text-white/60 italic line-clamp-2">
                          "{v.prompt.slice(0, 140)}
                          {v.prompt.length > 140 ? "…" : ""}"
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => restoreVersion(v.version_number)}
                      disabled={restoreBusy !== null}
                      className="text-[12px] bg-white text-black rounded-full px-3 py-1.5 hover:bg-white/90 transition-colors disabled:opacity-40 shrink-0"
                    >
                      {restoreBusy === v.version_number ? "Restoring…" : "Restore"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-end mt-4">
              <button
                onClick={() => setVersionsOpen(false)}
                disabled={restoreBusy !== null}
                className="text-[13px] text-white/60 hover:text-white px-3 py-2 disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {imageModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/70 backdrop-blur-sm"
          onClick={() => !imageBusy && setImageModalOpen(false)}
        >
          <div
            className="bg-[#0c0c0e] border border-white/15 rounded-2xl p-6 max-w-[440px] w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[16px] font-medium mb-1">
              Generate a hero image
            </div>
            <div className="text-[13px] text-white/50 mb-4 leading-relaxed">
              Describe the photo you want. I'll generate it with OpenAI
              and Claude will swap it into your site.
            </div>
            <textarea
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              rows={3}
              placeholder="e.g. couple holding hands on a Tulum beach at sunset, warm tones"
              disabled={imageBusy}
              autoFocus
              className="w-full resize-none bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-[14px] text-white placeholder:text-white/40 focus:outline-none focus:border-white/30 disabled:opacity-50 mb-3"
            />
            {imageError && (
              <div className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-3">
                {imageError}
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setImageModalOpen(false)}
                disabled={imageBusy}
                className="text-[13px] text-white/60 hover:text-white px-3 py-2 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={generateHeroImage}
                disabled={imageBusy || !imagePrompt.trim()}
                className="text-[13px] bg-white text-black rounded-full px-4 py-2 hover:bg-white/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {imageBusy ? "Generating…" : "Generate"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .builder-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: rgba(255,255,255,0.6);
          display: inline-block;
          animation: builderPulse 1.2s ease-in-out infinite;
        }
        .builder-dot:nth-child(2) { animation-delay: 0.2s; }
        .builder-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes builderPulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }

        .builder-preview-loader {
          animation: builderFadeIn 0.4s ease;
        }
        .builder-preview-mark {
          width: 64px;
          height: 64px;
          margin: 0 auto;
          border-radius: 50%;
          background: radial-gradient(circle at 32% 28%, rgba(255,255,255,0.18), rgba(255,255,255,0.04) 70%, transparent);
          border: 0.5px solid rgba(255,255,255,0.18);
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255,255,255,0.7);
          font-family: Georgia, 'Times New Roman', serif;
          font-style: italic;
          font-size: 28px;
          letter-spacing: 0.02em;
          position: relative;
          animation: builderMarkPulse 3s ease-in-out infinite;
        }
        .builder-preview-mark::before {
          content: '';
          position: absolute;
          inset: -12px;
          border-radius: 50%;
          border: 0.5px solid rgba(255,255,255,0.12);
          animation: builderRingPulse 3s ease-in-out infinite;
        }
        .builder-preview-letter {
          z-index: 1;
        }
        @keyframes builderMarkPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.15); }
          50% { box-shadow: 0 0 24px 4px rgba(255,255,255,0.08); }
        }
        @keyframes builderRingPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0; }
        }
        @keyframes builderFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
