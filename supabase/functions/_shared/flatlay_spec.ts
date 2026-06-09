// Stage 3 — the LLM/content layer for the flat-lay engine.
//
// withDefaults(partial) merges a (possibly sparse) spec from an LLM or a form
// over DEFAULT_SPEC, so callers only supply the couple-specific content and the
// rest (photos, icons, decorative assets) falls back to sensible defaults.
//
// FLATLAY_SPEC_PROMPT is the system prompt that turns a freeform request
// ("wedding for Mia & Noah, Aug 2026, Napa vineyard, cocktail attire") into a
// partial FlatLaySpec JSON, which we then run through composeFlatLay().

import { composeFlatLay, DEFAULT_SPEC, type FlatLaySpec } from "./flatlay_template.ts";

export { composeFlatLay, DEFAULT_SPEC, type FlatLaySpec };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const isPlainObj = (x: Any): boolean => x !== null && typeof x === "object" && !Array.isArray(x);

function deepMerge(base: Any, over: Any): Any {
  if (over === undefined || over === null) return base;
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (isPlainObj(base)) {
    const out: Any = { ...base };
    if (isPlainObj(over)) for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
    return out;
  }
  return over;
}

/** Merge a partial spec over DEFAULT_SPEC, deriving/backfilling what's missing. */
export function withDefaults(partial: Any): FlatLaySpec {
  const p = partial ?? {};
  const spec: Any = deepMerge(DEFAULT_SPEC, p);

  // initials follow the names unless explicitly given
  if (p.name1 && !p.init1) spec.init1 = String(p.name1).trim().charAt(0).toUpperCase() || spec.init1;
  if (p.name2 && !p.init2) spec.init2 = String(p.name2).trim().charAt(0).toUpperCase() || spec.init2;

  // map query follows the venue unless explicitly given
  if (p.venue && !p.mapQuery) spec.mapQuery = encodeURIComponent(String(p.venue)).replace(/%20/g, "+");

  // arrays replace wholesale → backfill per-item fields from defaults
  if (Array.isArray(p.partners)) {
    spec.partners = p.partners.map((pt: Any, i: number) => {
      const d = DEFAULT_SPEC.partners[i % DEFAULT_SPEC.partners.length];
      return {
        photo: pt.photo ?? d.photo,
        role: pt.role ?? (i === 0 ? "Partner One" : "Partner Two"),
        bio: pt.bio ?? d.bio,
        ffLabel: pt.ffLabel ?? d.ffLabel,
        ffacts: Array.isArray(pt.ffacts) ? pt.ffacts : d.ffacts,
      };
    });
  }
  if (Array.isArray(p.schedule)) {
    spec.schedule = p.schedule.map((s: Any, i: number) => ({
      iconKey: s.iconKey ?? DEFAULT_SPEC.schedule[i % DEFAULT_SPEC.schedule.length].iconKey,
      time: s.time ?? "",
      label: s.label ?? "",
    }));
  }

  if (p.slug) spec.slug = p.slug;
  return spec as FlatLaySpec;
}

/** Convenience: partial spec → composed flat-lay HTML. */
export function composeFromPartial(partial: Any): string {
  return composeFlatLay(withDefaults(partial));
}

export const FLATLAY_SPEC_PROMPT = `You are a content director for premium wedding/event microsites. Given the user's request, output ONE JSON object — a partial FlatLaySpec — and NOTHING else (no prose, no markdown fences).

Rules:
- Use the couple's real names, date, venue, and any details verbatim when given.
- Invent tasteful, specific content where the user didn't provide it: a schedule, a menu, a how-they-met story, fun facts, FAQs, travel notes. Make it feel real and elegant, never "[placeholder]".
- DO NOT include any image URLs or photo fields — photos are filled automatically. Omit: heroPhoto, gallery, and any "photos"/"proposalPhotos"/"engagementPhotos"/"photo" keys.
- For dates: dateFull = "Saturday, August 22, 2026", dateLong = "August 22, 2026". Times like "5:00 in the evening".
- address may include "<br>" before the city line.
- travel/faq "body" must be one or more <p class="faq-a">…</p> paragraphs (you may use <strong> and <br>).

Shape (all optional; fill what you can):
{
  "name1","name2",                         // first names (init1/init2 auto-derived)
  "dateFull","dateLong","timeStart","timeEnd",
  "venue","address","mapQuery",            // mapQuery url-encoded e.g. "Stonebridge+Vineyard+Napa+CA"
  "dressCode","signoffPre","heroIntro",
  "schedule":[{ "iconKey","time","label" }],
  "menus":[{ "iconKey","title","items":[{ "name","desc"? }] }],
  "story":{ "howMet":{ "title","body" }, "firstDate":{ "body" }, "proposal":{ "body" } },
  "partners":[
    { "role":"Partner One","bio","ffLabel":"Fun Facts","ffacts":[ ... ] },
    { "role":"Partner Two","bio","ffLabel":"Fun Fact","ffacts":[ ... ] }
  ],
  "travel":[{ "iconKey","title","body" }],
  "faqs":[{ "iconKey","title","body" }],
  "mealOptions":[ ... ],
  "events":[{ "label","checked" }],
  "swatches":[ "#hex", ... ]
}

ICON KEYS (reuse these; pick the closest):
- schedule: sch0 (ceremony/rings), sch1 (cocktail glass), sch2 (reception), sch3 (dancing/special activities)
- menus:    menu0 (plate/menu), menu1 (bar/glass), menu2 (dessert/cake)
- travel:   trv0 (hotel), trv1 (room block), trv2 (parking), trv3 (shuttle)
- faqs:     faq0 (plus-one/people), faq1 (children), faq2 (parking), faq3 (weather), faq4 (more questions)

Output the JSON object only.`;
