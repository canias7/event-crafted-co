// Flat-lay builder — the default "create a wedding site" experience.
//
// Collects a FlatLaySpec via a simple form and POSTs it to the
// flatlay-generate edge function ({ spec }) which composes the deterministic
// flat-lay invite and saves it to ai_sites (served at /s/<slug>). Works with
// no Anthropic credits. The "Describe it" box uses the LLM ({ prompt }) path
// when credits are available, and degrades gracefully when they aren't.

import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { VendoraLogo } from "@/components/shared/VendoraLogo";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// Generic, tasteful starter content so the very first preview is coherent.
// Couples edit it; nothing falls back to the original sample's text.
const STARTER = {
  name1: "Alex",
  name2: "Sam",
  date: "2026-09-19",
  timeStart: "4:00 in the afternoon",
  timeEnd: "10:00 in the evening",
  venue: "The Garden Pavilion",
  address: "100 Rose Lane\nMeadowbrook, CA 90000",
  dressCode: "Garden Formal",
  signoffPre: "With all our love,",
  heroIntro: "Two paths, one beautiful adventure — we can’t wait to celebrate with you.",
  howMetTitle: "Where It Began",
  howMet:
    "We met on an ordinary afternoon that turned out to be anything but. One conversation became hours, hours became a lifetime — and here we are.",
  firstDate:
    "A long walk that neither of us wanted to end, two coffees, and a shared dessert we still argue about.",
  proposal:
    "Back where it all started, with shaking hands and the easiest “yes” in the world.",
  p1bio:
    "A hopeless optimist with a weakness for good books, long hikes, and an even longer to-do list.",
  p1facts: "Reads two books a week\nMakes a famous lemon cake\nWill adopt every dog",
  p2bio:
    "The calm to the storm — makes the coffee, tells the worst jokes, and never says no to an adventure.",
  p2facts: "Can fix almost anything",
  schedule:
    "4:00 PM | Ceremony\n5:00 PM | Cocktail Hour\n6:00 PM | Reception\n9:00 PM | Dancing",
  menu:
    "Heirloom Tomato & Burrata | basil · aged balsamic\nHerb-Roasted Chicken | lemon · thyme\nWild Mushroom Risotto | vegetarian",
  bar:
    "House Cocktail | seasonal\nWine | red · white · rosé\nChampagne Toast",
  dessert: "Celebration Cake\nSeasonal Tartlets\nCoffee & Tea Bar",
};

// Generic spec parts the form doesn't (yet) edit field-by-field — sent every
// time so the site stays coherent and never inherits sample content.
const GENERIC_EXTRAS = {
  travel: [
    {
      iconKey: "trv0",
      title: "Where to Stay",
      body: '<p class="faq-a">We’ve reserved a block of rooms at a hotel near the venue. Details and the group rate will be shared with your invitation.</p>',
    },
    {
      iconKey: "trv2",
      title: "Getting There",
      body: '<p class="faq-a">Complimentary parking is available on site, and a shuttle will run to and from the hotel in the evening.</p>',
    },
  ],
  faqs: [
    {
      iconKey: "faq0",
      title: "Plus-Ones",
      body: '<p class="faq-a">Your invitation will note everyone we’ve saved a seat for. Questions about your party? Just reach out.</p>',
    },
    {
      iconKey: "faq3",
      title: "What to Wear",
      body: '<p class="faq-a">Dress to celebrate. The ceremony is partly outdoors, so plan footwear accordingly.</p>',
    },
  ],
  swatches: ["#2f3d24", "#5e7548", "#9caa85", "#c7a85e", "#d9c4a0", "#f2ead6"],
  mealOptions: ["Chicken", "Fish", "Vegetarian", "Kids' Meal"],
  events: [
    { label: "Ceremony", checked: true },
    { label: "Reception", checked: true },
    { label: "Welcome Party", checked: false },
    { label: "Farewell Brunch", checked: false },
  ],
};

type Result = { slug: string; title: string; url: string };

const lines = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);
const pipe = (l: string): [string, string] => {
  const i = l.indexOf("|");
  return i < 0 ? [l.trim(), ""] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
};

export default function FlatLayBuilderPage() {
  const [f, setF] = useState(STARTER);
  const [aiPrompt, setAiPrompt] = useState("");
  const [busy, setBusy] = useState<null | "form" | "ai">(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const set = (k: keyof typeof STARTER) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  function buildSpec(): Record<string, unknown> {
    const d = f.date ? new Date(f.date + "T00:00:00") : null;
    const dateFull = d
      ? d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      : "";
    const dateLong = d
      ? d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
      : "";
    const schedule = lines(f.schedule).map((l, i) => {
      const [time, label] = pipe(l);
      return { iconKey: `sch${i % 4}`, time, label };
    });
    const menuGroup = (iconKey: string, title: string, text: string) => ({
      iconKey,
      title,
      items: lines(text).map((l) => {
        const [name, desc] = pipe(l);
        return desc ? { name, desc } : { name };
      }),
    });
    const menus = [
      f.menu.trim() && menuGroup("menu0", "Menu", f.menu),
      f.bar.trim() && menuGroup("menu1", "Bar Menu", f.bar),
      f.dessert.trim() && menuGroup("menu2", "Dessert", f.dessert),
    ].filter(Boolean);

    const spec: Record<string, unknown> = {
      name1: f.name1,
      name2: f.name2,
      dateFull,
      dateLong,
      timeStart: f.timeStart,
      timeEnd: f.timeEnd,
      venue: f.venue,
      address: f.address.replace(/\n/g, "<br>"),
      dressCode: f.dressCode,
      signoffPre: f.signoffPre,
      heroIntro: f.heroIntro,
      schedule,
      menus,
      story: {
        howMet: { title: f.howMetTitle, body: f.howMet },
        firstDate: { body: f.firstDate },
        proposal: { body: f.proposal },
      },
      partners: [
        { role: "Partner One", bio: f.p1bio, ffLabel: "Fun Facts", ffacts: lines(f.p1facts) },
        { role: "Partner Two", bio: f.p2bio, ffLabel: "Fun Fact", ffacts: lines(f.p2facts) },
      ],
      ...GENERIC_EXTRAS,
    };
    // Couple's own photos drive the gallery + Our Story hero; anything else
    // (partner portraits, story shots) keeps elegant defaults.
    if (photos.length) {
      spec.gallery = photos.map((src, i) => ({ src, name: `photo-${i + 1}.jpg` }));
      spec.heroPhoto = photos[0];
    }
    return spec;
  }

  async function call(payload: Record<string, unknown>, which: "form" | "ai") {
    setBusy(which);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/flatlay-generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${session?.access_token ?? SUPABASE_KEY}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (typeof json?.error === "string" && json.error.startsWith("anthropic_")) {
          throw new Error("The AI writer is temporarily unavailable. Fill in the form below instead — it works right away.");
        }
        throw new Error(json?.error ? `Couldn’t create the site (${json.error}).` : "Couldn’t create the site. Try again.");
      }
      setResult({ slug: json.slug, title: json.title, url: json.url });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  async function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-picking the same files
    if (!files.length) return;
    setUploading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? SUPABASE_KEY;
      const urls: string[] = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append("image", file);
        const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-site-image-upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY },
          body: fd,
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j?.image_url) {
          const map: Record<string, string> = {
            image_too_large: "A photo is over 12MB — pick something smaller.",
            unsupported_image_type: "Photos must be JPG, PNG, WebP, GIF, or HEIC.",
          };
          throw new Error(map[j?.error ?? ""] ?? "Couldn’t upload a photo. Try again.");
        }
        urls.push(j.image_url as string);
      }
      setPhotos((prev) => [...prev, ...urls]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const submitForm = () => {
    if (!f.name1.trim() || !f.name2.trim()) {
      setError("Add both names first.");
      return;
    }
    void call({ spec: buildSpec() }, "form");
  };
  const submitAi = () => {
    if (!aiPrompt.trim()) return;
    void call({ prompt: aiPrompt.trim() }, "ai");
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-black">
      <header className="flex items-center justify-between px-6 py-5 md:px-10 md:py-6 border-b border-black/10">
        <Link to="/" className="flex items-center gap-3">
          <VendoraLogo size="sm" color="#000" />
          <span className="text-[12px] uppercase tracking-[2px] text-black/50">Create a wedding site</span>
        </Link>
        <Link to="/my-sites" className="text-[13px] text-black/60 hover:text-black transition-colors">My sites</Link>
      </header>

      <main className="max-w-2xl mx-auto px-6 md:px-10 py-10">
        {result ? (
          <div className="text-center py-6">
            <div className="text-[22px] font-medium mb-1">Your site is live ✦</div>
            <div className="text-[14px] text-black/60 mb-5">{result.title}</div>
            <div
              className="mx-auto mb-6 overflow-hidden rounded-2xl border border-black/10"
              style={{ width: "100%", maxWidth: 380, aspectRatio: "9 / 16" }}
            >
              <iframe title="Preview" src={result.url} className="w-full h-full" />
            </div>
            <div className="flex items-center justify-center gap-3">
              <a href={result.url} target="_blank" rel="noreferrer"
                 className="bg-black text-white rounded-full px-6 py-3 text-[13px] hover:bg-black/90 transition-colors">
                Open site
              </a>
              <button onClick={() => setResult(null)}
                 className="rounded-full px-6 py-3 text-[13px] border border-black/15 hover:bg-black/5 transition-colors">
                Create another
              </button>
            </div>
            <div className="mt-3 text-[12px] text-black/40 break-all">{result.url}</div>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-[13px] px-4 py-3">
                {error}
              </div>
            )}

            {/* AI shortcut */}
            <section className="mb-9 rounded-2xl border border-black/10 bg-white p-5">
              <div className="text-[12px] uppercase tracking-[1.5px] text-black/45 mb-2">Describe it (AI)</div>
              <textarea
                className="w-full resize-none rounded-xl border border-black/15 px-3.5 py-3 text-[14px] outline-none focus:border-black/40"
                rows={2}
                placeholder="e.g. Wedding for Mia & Noah, Aug 22 2026 at Stonebridge Vineyard in Napa, cocktail attire, they met hiking…"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
              />
              <div className="mt-2.5 flex items-center justify-between">
                <span className="text-[12px] text-black/40">Or fill the form below.</span>
                <button onClick={submitAi} disabled={busy !== null || !aiPrompt.trim()}
                  className="rounded-full px-5 py-2.5 text-[13px] bg-black text-white hover:bg-black/90 disabled:opacity-40 transition-colors">
                  {busy === "ai" ? "Writing…" : "Generate with AI"}
                </button>
              </div>
            </section>

            <Section title="The couple">
              <Row>
                <Field label="Name 1" value={f.name1} onChange={set("name1")} />
                <Field label="Name 2" value={f.name2} onChange={set("name2")} />
              </Row>
            </Section>

            <Section title="The day">
              <Row>
                <Field label="Date" type="date" value={f.date} onChange={set("date")} />
                <Field label="Dress code" value={f.dressCode} onChange={set("dressCode")} />
              </Row>
              <Row>
                <Field label="Start time" value={f.timeStart} onChange={set("timeStart")} />
                <Field label="End time" value={f.timeEnd} onChange={set("timeEnd")} />
              </Row>
            </Section>

            <Section title="The venue">
              <Field label="Venue name" value={f.venue} onChange={set("venue")} />
              <Field label="Address" textarea rows={2} value={f.address} onChange={set("address")} />
            </Section>

            <Section title="Your photos" hint="First one becomes the hero · the rest fill the gallery">
              <div className="flex flex-wrap gap-2.5">
                {photos.map((p, i) => (
                  <div key={p} className="relative w-[88px] h-[88px] rounded-xl overflow-hidden border border-black/10">
                    <img src={p} alt="" className="w-full h-full object-cover" />
                    {i === 0 && (
                      <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[9px] text-center py-0.5 tracking-wide">HERO</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-[12px] leading-none flex items-center justify-center hover:bg-black"
                      aria-label="Remove photo"
                    >×</button>
                  </div>
                ))}
                <label className="w-[88px] h-[88px] rounded-xl border border-dashed border-black/25 flex flex-col items-center justify-center text-[11px] text-black/50 cursor-pointer hover:bg-black/5 transition-colors">
                  {uploading ? "Uploading…" : <><span className="text-[18px] leading-none mb-0.5">+</span>Add photos</>}
                  <input type="file" accept="image/*" multiple hidden onChange={onPickPhotos} disabled={uploading} />
                </label>
              </div>
              {photos.length === 0 && (
                <p className="text-[12px] text-black/40">Optional — leave empty to use elegant stock photos you can swap later.</p>
              )}
            </Section>

            <Section title="Schedule" hint="One per line · “TIME | Label”">
              <Field label="" textarea rows={4} value={f.schedule} onChange={set("schedule")} />
            </Section>

            <Section title="Food & drinks" hint="One per line · “Name | description”">
              <Field label="Menu" textarea rows={3} value={f.menu} onChange={set("menu")} />
              <Field label="Bar" textarea rows={3} value={f.bar} onChange={set("bar")} />
              <Field label="Dessert" textarea rows={3} value={f.dessert} onChange={set("dessert")} />
            </Section>

            <Section title="Your story">
              <Field label="How we met — title" value={f.howMetTitle} onChange={set("howMetTitle")} />
              <Field label="How we met" textarea rows={3} value={f.howMet} onChange={set("howMet")} />
              <Field label="First date" textarea rows={2} value={f.firstDate} onChange={set("firstDate")} />
              <Field label="The proposal" textarea rows={2} value={f.proposal} onChange={set("proposal")} />
              <Field label="Hero intro line" value={f.heroIntro} onChange={set("heroIntro")} />
            </Section>

            <Section title="Meet the couple" hint="Fun facts: one per line">
              <Field label="Partner one — bio" textarea rows={2} value={f.p1bio} onChange={set("p1bio")} />
              <Field label="Partner one — fun facts" textarea rows={3} value={f.p1facts} onChange={set("p1facts")} />
              <Field label="Partner two — bio" textarea rows={2} value={f.p2bio} onChange={set("p2bio")} />
              <Field label="Partner two — fun fact" textarea rows={2} value={f.p2facts} onChange={set("p2facts")} />
            </Section>

            <Section title="Sign-off">
              <Field label="Closing line" value={f.signoffPre} onChange={set("signoffPre")} />
            </Section>

            <div className="sticky bottom-0 -mx-6 md:-mx-10 px-6 md:px-10 py-4 bg-[#fafafa]/90 backdrop-blur border-t border-black/10 flex items-center justify-end gap-3">
              <span className="text-[12px] text-black/40 mr-auto">Photos &amp; colors use elegant defaults — swap them later.</span>
              <button onClick={submitForm} disabled={busy !== null || uploading}
                className="rounded-full px-7 py-3 text-[13px] bg-black text-white hover:bg-black/90 disabled:opacity-40 transition-colors">
                {busy === "form" ? "Creating…" : "Create site"}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <div className="flex items-baseline justify-between mb-2.5">
        <h2 className="text-[15px] font-medium">{title}</h2>
        {hint && <span className="text-[11px] text-black/40">{hint}</span>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}

function Field({
  label, value, onChange, textarea, rows, type,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  textarea?: boolean;
  rows?: number;
  type?: string;
}) {
  const cls =
    "w-full rounded-xl border border-black/15 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-black/40";
  return (
    <label className="block">
      {label && <span className="block text-[12px] text-black/50 mb-1.5">{label}</span>}
      {textarea ? (
        <textarea className={cls + " resize-none"} rows={rows ?? 3} value={value} onChange={onChange} />
      ) : (
        <input className={cls} type={type ?? "text"} value={value} onChange={onChange} />
      )}
    </label>
  );
}
