// AI Website Builder — generate OR edit a small event microsite.
//
// Two modes:
//   • new      — POST {prompt, conversation?, owner_user_id?}
//                → creates a new row, returns a slug.
//   • edit     — POST {prompt, edit_site_id, conversation?}
//                → loads current HTML, asks Claude for the modified
//                  full HTML, UPDATEs the row in place. Same slug.
//
// Streaming: response is text/event-stream. Each Anthropic text_delta
// becomes `data: {"type":"chunk","text":"..."}`. After the model
// finishes we save and emit `data: {"type":"done","slug":"...","title":"..."}`.
//
// Auth: public (verify_jwt = false). Inserts/updates run with service
// role; if owner_user_id is included in the request payload we trust
// it (the frontend reads it from the user's session — see the
// useAuth-gated builder page).

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

// Pre-flight content filter. Anthropic + OpenAI both have safety
// layers; this is a cheap upfront gate to reject obvious abuse
// before we burn an API call. Kept inline (rather than imported from
// _shared) because the Supabase function deploy bundles one file at
// a time.
const BLOCKED_TERMS = [
  "porn", "pornographic", "xxx", "nude", "nudes", "nsfw", "erotic",
  "kill yourself", "kys", "school shooting", "make a bomb",
  "build a bomb", "child porn", "csam",
  "nigger", "n1gger", "faggot", "kike", "chink", "spic", "tranny",
  "retard",
];
function moderatePrompt(prompt: string): { ok: true } | { ok: false; reason: string } {
  if (!prompt) return { ok: true };
  const n = prompt.toLowerCase();
  for (const t of BLOCKED_TERMS) {
    if (n.includes(t)) return { ok: false, reason: "blocked_content" };
  }
  return { ok: true };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

const MODEL = "claude-sonnet-4-6";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Verified working Unsplash photo IDs. These are stable URLs that
// returned 200 at the time of the playbook write. Claude is told to
// pick FROM this list rather than invent IDs (which often 404).
//
// If you want to extend: HEAD-check first with
// `curl -sk -o /dev/null -w "%{http_code}" https://images.unsplash.com/photo-<id>?w=400&q=80`.
const VERIFIED_PHOTOS = `
EVERY PHOTO LISTED HERE IS HEAD-CHECKED AND WORKS. NEVER invent a photo ID — only use what's listed.

URL format: https://images.unsplash.com/photo-<id>?w=1600&auto=format&fit=crop
For backgrounds: ?w=2000&q=80&fit=crop. For square: &h=1600 too.

═══ WEDDING / ENGAGEMENT / ANNIVERSARY ═══

ROMANTIC COUPLES (universal — hero shots, story sections):
  photo-1519741497674-611481863552 (couple silhouette beach)
  photo-1465495976277-4387d4b0b4c6 (couple sunset)
  photo-1469371670807-013ccf25f16a (couple romantic)
  photo-1464366400600-7168b8af9bc3 (couple twilight)
  photo-1532712938310-34cb3982ef74 (intimate moment)

RINGS / DETAILS:
  photo-1583939003579-730e3918a45a (rings on linen)
  photo-1546484959-f9a381d1330d (close-up details)
  photo-1605100804763-247f67b3557e (rings macro)

SUNSET / GOLDEN HOUR (atmospheric — use for any event with a sunset/twilight ceremony or romantic mood):
  photo-1495020689067-958852a7765e (warm sunset)
  photo-1419242902214-272b3f66ee7a (golden hour)
  photo-1499678329028-101435549a4e (twilight scene)

CHAMPAGNE / TOAST / CHEERS (any celebration — wedding, NYE, anniversary, milestone birthday):
  photo-1551024601-bec78aea704b (champagne pour / toast)

CAKE / DESSERTS — CLOSE-UPS (use for cake-cutting section in weddings, birthdays, showers):
  photo-1565958011703-44f9829ba187 (elegant cake)
  photo-1535254973040-607b474cb50d (cake close-up)
  photo-1571877227200-a0d98ea607e9 (dessert spread)
  photo-1535141192574-5d4897c12636 (cake detail)
  photo-1499636136210-6f4ee915583e (dessert table)

DANCE FLOOR / BAND / NIGHT RECEPTION:
  photo-1496337589254-7e19d01cec44 (dance floor)
  photo-1429962714451-bb934ecdc4ec (band / night scene)

TRAVEL / SAVE-THE-DATE / DESTINATION (passport, airplane, suitcase — use on save-the-date / travel sections of destination weddings):
  photo-1488646953014-85cb44e25828 (passport / travel)
  photo-1436491865332-7a61a109cc05 (airplane window)
  photo-1559268950-2d7ceb2efa3a (travel atmosphere)
  photo-1530789253388-582c481c54b0 (suitcase / journey)

EUCALYPTUS / BOTANICAL CLOSE-UPS (greenery accents anywhere):
  photo-1469474968028-56623f02e42e (eucalyptus)
  photo-1490750967868-88aa4486c946 (botanical close-up)

CANDLES / WARM TABLE SETTINGS:
  photo-1576091160550-2173dba999ef (candlelit table)

VINEYARD / WINE CLOSE-UPS (for Napa/Tuscany/Sonoma weddings — vineyard sub-bank):
  photo-1506377247377-2a5b3b417ebb (vineyard barrel / wine)

WEDDING — BEACH / TROPICAL DESTINATION (Tulum, Cancun, Maldives, Bali, Hawaii, Caribbean):
  photo-1559666126-84f389727b9a (tropical ocean / palms)
  photo-1582719188393-bb71ca45dbb9 (beach destination ceremony)
  photo-1507525428034-b723cf961d3e (beach sunset)
  photo-1518021964703-4b2030f03085 (palm tropical)
  photo-1469854523086-cc02fe5d8800 (warm coastal)
  photo-1538439907460-1596cafd4eff (beach wedding scene)
  photo-1583224964978-2257b960c3d3 (tropical ceremony)

WEDDING — MOUNTAIN / ALPINE / SKI (Aspen, Switzerland, Tahoe, Whistler, Colorado, Banff):
  photo-1464822759023-fed622ff2c3b (mountain vista)
  photo-1500916434205-0c77489c6cf7 (alpine peaks)
  photo-1571055107559-3e67626fa8be (mountain misty)
  photo-1551522435-a13afa10f103 (mountain elopement)
  photo-1497436072909-60f360e1d4b1 (forest mountain)
  photo-1542273917363-3b1817f69a2d (alpine outdoor)

WEDDING — GARDEN / ESTATE / VINEYARD (Napa, Tuscany, Provence, English countryside, Sonoma):
  photo-1517994112540-009c47ea476b (garden estate)
  photo-1530841377377-3ff06c0ca713 (vineyard / countryside)
  photo-1606925797300-0b35e9d1794e (rolling hills)
  photo-1518709268805-4e9042af9f23 (garden ceremony arch)
  photo-1455587734955-081b22074882 (garden wedding)
  photo-1531722569936-825d3dd91b15 (outdoor garden)

WEDDING — BARN / RUSTIC / RANCH:
  photo-1554080353-a576cf803bda (barn / rustic)

WEDDING — BALLROOM / CLASSIC / BLACK-TIE / FORMAL:
  photo-1530023367847-a683933f4172 (elegant ballroom)
  photo-1520854221256-17451cc331bf (formal reception)
  photo-1493804714600-6edb1cd93080 (classic glam)

WEDDING — CITY / URBAN / ROOFTOP / LOFT (Manhattan, downtown, modern venues):
  photo-1519501025264-65ba15a82390 (city skyline night)
  photo-1496588152823-86ff7695e68f (city night lights)
  photo-1502920917128-1aa500764cbd (urban skyline)
  photo-1485871981521-5b1fd3805eee (modern building)
  photo-1480714378408-67cf0d13bc1b (loft / industrial)
  photo-1496939376851-89342e90adcd (rooftop view)
  photo-1444525873963-75d329ef9e1b (downtown atmosphere)

WEDDING — BARN / RUSTIC / RANCH:
  photo-1554080353-a576cf803bda (barn / rustic)
  photo-1502301197179-65228ab57f78 (rustic countryside)

WEDDING — LAKE / WATERFRONT (Lake Como, Lake Tahoe, lakeside venues — NOT beach):
  photo-1500530855697-b586d89ba3ee (calm lake)
  photo-1502082553048-f009c37129b9 (waterfront atmosphere)

WEDDING — WINTER / SNOW / CABIN (ski wedding, winter elopement, lodge):
  photo-1483921020237-2ff51e8e4b22 (snow landscape)
  photo-1543966888-7c1dc482a810 (winter atmosphere)
  photo-1551582045-6ec9c11d8697 (winter cabin)

WEDDING — LAVENDER / MEDITERRANEAN (Provence, Italian countryside, olive groves):
  photo-1499002238440-d264edd596ec (lavender / countryside)

WEDDING — MOROCCO / BOHO / DESERT TENT (Marrakech, Joshua Tree, desert venues):
  photo-1539768942893-daf53e448371 (boho tent / desert)

FLORALS / DECOR (any wedding type — accent imagery):
  photo-1525772764200-be829a350797 (wedding florals)
  photo-1519225421980-715cb0215aed (wedding decor)
  photo-1511795409834-ef04bbd61622 (pink florals)
  photo-1478146896981-b80fe463b330 (elegant flowers)
  photo-1487530811176-3780de880c2d (wedding flowers)
  photo-1485827404703-89b55fcc595e (florals close-up)
  photo-1473893604213-3df9c15611c0 (decor detail)
  photo-1521223890158-f9f7c3d5d504 (botanical accent)

═══ BIRTHDAY ═══

ADULT BIRTHDAY / COCKTAIL / SPEAKEASY / 21+:
  photo-1551739440-5dd934d3a94a (cocktails / glam)
  photo-1514525253161-7a46d19cd819 (party night)
  photo-1556679343-c7306c1976bc (cocktail glasses)
  photo-1530021232320-687d8e3dba54 (gold party glam)
  photo-1571805529673-0f56b922b359 (luxe celebration)
  photo-1492684223066-81342ee5ff30 (party balloons)

KIDS BIRTHDAY (1-12) — colorful / playful (AVOID identifiable kid faces):
  photo-1530103862676-de8c9debad1d (birthday balloons)
  photo-1530103043960-ef38714abb15 (cake)
  photo-1464347744102-11db6282f854 (kids party scene)
  photo-1558636508-e0db3814bd1d (colorful party)
  photo-1474552226712-ac0f0961a954 (kid party setup)
  photo-1576919228236-a097c32a5cd4 (party decor)
  photo-1607344645866-009c320b63e0 (themed kids party)

═══ BABY SHOWER / GENDER REVEAL / BRIDAL SHOWER ═══

BABY SHOWER (soft pastels, baby items):
  photo-1554080353-321e452ccf19 (baby shower decor)
  photo-1519689680058-324335c77eba (baby shoes / pastels)
  photo-1607706189992-eae578626c86 (florals + baby items)

BRIDAL SHOWER / BRUNCH / TEA PARTY:
  photo-1525755662778-989d0524087e (brunch table)
  photo-1519999482648-25049ddd37b1 (afternoon tea)
  photo-1496318447583-f524534e9ce1 (floral spread)
  photo-1525351484163-7529414344d8 (elegant brunch)

═══ GRADUATION ═══

  photo-1523580494863-6f3031224c94 (graduation scene)
  photo-1561489413-985b06da5bee (caps / celebration)

═══ QUINCEAÑERA / SWEET 16 / BAT MITZVAH (formal, regal) ═══

  photo-1521334884684-d80222895322 (regal celebration)
  photo-1494797262163-102fae527c62 (formal portrait scene)
  photo-1480365501497-199581be0e66 (ceremony / temple setting)

═══ HOLIDAY PARTY ═══

CHRISTMAS / WINTER (forest green + cranberry + gold):
  photo-1606925797300-0b35e9d1794e (winter countryside)
  photo-1545048702-79362596cdc9 (christmas atmosphere)

NYE / NEW YEAR (black + gold + champagne):
  photo-1492684223066-81342ee5ff30 (party balloons gold)
  photo-1571805529673-0f56b922b359 (luxe night)
  photo-1530021232320-687d8e3dba54 (gold glam)

HALLOWEEN (dark + orange + purple):
  photo-1509557965875-b88c97052f0e (halloween atmospheric)
  photo-1574169208507-84376144848b (halloween mood)
  photo-1538485399081-7191377e8241 (spooky atmospheric)

═══ BBQ / 4TH OF JULY / SUMMER OUTDOOR ═══

  photo-1555939594-58d7cb561ad1 (grill / bbq)
  photo-1535007813616-79dc02ba4021 (outdoor summer)
  photo-1561758033-d89a9ad46330 (backyard party)

═══ DINNER PARTY (intimate) ═══

  photo-1414235077428-338989a2e8c0 (set candlelit table)
  photo-1559339352-11d035aa65de (intimate dining)

═══ RETIREMENT (warm classic) ═══

  photo-1497032628192-86f99bcd76bc (warm classic)
  photo-1532712938310-34cb3982ef74 (multi-generational warm)

═══ HOUSEWARMING (cozy modern home) ═══

  photo-1502672023488-70e25813eb80 (cozy home interior)
  photo-1493809842364-78817add7ffb (modern living)
  photo-1556909114-f6e7ad7d3136 (warm home aesthetic)

═══ TEXTURED / MOODY BACKGROUNDS (place-NEUTRAL — safe for ANY event when location is vague or formal) ═══

Pure texture (dark slate, velvet, marble, linen) — no location implied. Use these as cover-page backdrops, body backgrounds, or hero overlays for formal/black-tie/classic events with no specific venue:

  photo-1481277542470-605612bd2d61 (dark moody texture)
  photo-1503602642458-232111445657 (dark velvet / fabric)
  photo-1542038784456-1ea8e935640e (atmospheric dark)
  photo-1518837695005-2083093ee35b (textured surface)
  photo-1518895949257-7621c3c786d7 (moody atmospheric)
  photo-1517842645767-c639042777db (dark texture)
  photo-1494438639946-1ebd1d20bf85 (textured fabric / linen)
  photo-1607604276583-eef5d076aa5f (atmospheric)
  photo-1469594292607-7bd90f8d3ba4 (warm moody)
  photo-1611532736597-de2d4265fba3 (textured dark)
  photo-1542665952-14513db15293 (dramatic atmospheric)
  photo-1531346878377-a5be20888e57 (dark texture)
  photo-1604999333679-b86d54738315 (atmospheric)
  photo-1610375461246-83df859d849d (moody background)
  photo-1611348586804-61bf6c080437 (textured surface)

═══ GENERIC PARTY ATMOSPHERE (filler / accent) ═══

  photo-1521334726092-b509a19597c6 (elegant atmosphere)
  photo-1452860606245-08befc0ff44b (generic celebration)
  photo-1502635385003-ee1e6a1a742d (celebration scene)
  photo-1606800052052-a08af7148866 (decor elegant)
  photo-1565538810643-b5bdb714032a (party decor)
  photo-1471520201477-47a62a269a87 (atmosphere)
  photo-1500076656116-558758c991c1 (event scene)
  photo-1490822180406-880c226c150b (event atmosphere)
  photo-1503424886307-b090341d25d1 (party scene)
  photo-1543351611-58f69d7c1781 (party decor)
  photo-1517457373958-b7bdd4587205 (decor)
  photo-1496843916299-590492c751f4 (celebration)

═══ VENUE MATCHING (CRITICAL — read this before picking background) ═══

Before picking a background, READ the user's venue / location keyword carefully:
  • "Tulum" / "Cancun" / "Bali" / "Hawaii" / "Maldives" / beach / coastal / ocean / "destination" → BEACH bank
  • "Aspen" / "Switzerland" / "Tahoe" / "Whistler" / "Banff" / mountain / alpine / ski / forest cabin → MOUNTAIN bank
  • "Napa" / "Tuscany" / "Provence" / "Sonoma" / vineyard / garden / countryside / estate / villa → GARDEN / ESTATE bank
  • "barn" / "ranch" / "farm" / rustic → BARN bank
  • "ballroom" / "hotel" / "Plaza" / formal / black-tie / glam → BALLROOM bank
  • "NYC" / "rooftop" / "downtown" / "loft" / "skyline" / "city" → CITY bank
  • "Lake Como" / "Lake Tahoe" / "lakeside" / "waterfront" → LAKE bank
  • "ski" / "winter" / "snow" / "cabin" / "lodge" → WINTER / SNOW / CABIN bank
  • "Provence" / "lavender" / "olive grove" / Mediterranean → LAVENDER bank
  • "Marrakech" / "Morocco" / "Joshua Tree" / "desert tent" / boho desert → MOROCCO / BOHO bank
  • Destination wedding with travel theme → also include TRAVEL bank photos in a save-the-date section
  • Vague / no specific location / classic / formal with no destination → TEXTURED / MOODY (place-neutral)

NEVER pick alpine mountains for a beach wedding, ocean for an Aspen elopement, vineyards for a city loft, etc. If unsure which category fits, default to TEXTURED / MOODY — those work everywhere.

For decorative filler when nothing themed fits, https://picsum.photos/seed/<unique-word>/1600/900 always works.

If the user provides their OWN photo URL in a message, prefer that over anything from this bank. User-supplied is the truth.
`;

const EVENT_PLAYBOOKS = `=== EVENT PLAYBOOKS ===

Before generating, identify the event type from the user's prompt and apply the matching playbook. Use the playbook's expected sections, copy patterns, and palette guidance. Adapt to specifics the user provided (names, dates, vibe) — never override their explicit choices.

— WEDDING (formal or casual)
  Sections: Hero (couple names + date + location), Our Story (how they met / proposal), Wedding Party (optional), Schedule (Ceremony → Cocktail Hour → Reception), Travel & Stay, Registry, Dress Code, FAQs, RSVP, Thank you.
  RSVP wording — formal: "Kindly respond by [date]". Casual: "Save us a seat by [date]". Always include a deadline.
  Dress codes: Black Tie, Black Tie Optional, Formal, Cocktail Attire, Semi-Formal, Garden Party, Beach Formal, Festive, Casual.
  Registry default phrasing: "Your presence is the greatest gift, but if you'd like to contribute..."
  Tone: warm, sincere, never crass. First-person plural.
  Palette: deep jewel tones for formal; dusty pastels for garden; warm neutrals for boho/beach; ivory + black + gold for classic.

— KIDS BIRTHDAY (ages 1–12)
  Sections: Hero (kid's name + age + theme), Party Details (start AND end time, address), Activities, What to Bring, Parking/Drop-off, RSVP (to PARENT), Optional Gift Note.
  RSVP wording: "RSVP to [parent name] at [phone/email] by [date]" — parents need contact, not the kid. ALWAYS include end time.
  Dress code: "Wear your favorite [theme]!" / "Costumes encouraged!" — never formal.
  Tone: playful, energetic, plenty of emoji (🎉🎂🎈🦄🦖🌈).
  Palette: bright primaries, candy colors, or theme-driven.
  Photos: AVOID identifiable kid photos. Use emoji decoration, illustrations, party-setup, or CSS art.

— ADULT BIRTHDAY (milestone — 21, 30, 40, 50, 60+)
  Sections: Hero ("Cheers to [age]!"), Details, Optional Memory Wall, No-Gifts Note, Dress Code, RSVP.
  Default no-gifts phrasing: "Your presence is the only present needed."
  Tone: warm, slightly nostalgic for milestones.
  Palette: black/gold/champagne for elegant; bright fun for casual; 1920s reds/golds for speakeasy.

— BABY SHOWER
  Sections: Hero, Shower Details, Games (defaults below), Registry, Diaper Raffle, Dress Code ("pastel attire"), Wishes for Baby, RSVP.
  Default games: "Guess the Date Baby Arrives", "Baby Photo Match", "Don't Say Baby", "Write a Note to Baby".
  Tone: warm, sweet, sometimes sentimental.
  Palette: SOFT pastels. Sage + cream + dusty rose for gender-neutral. AVOID screaming pink/blue.

— GENDER REVEAL
  Sections: Hero ("Boy or Girl?" — both colors), Details, "Place Your Guess" (Team Blue / Team Pink), The Reveal description, Dress Code ("Wear your guess!"), RSVP.
  Tone: anticipatory, playful.
  Palette: 50/50 pink + blue with white/cream.

— BRIDAL SHOWER
  Sections: Hero, Details, Games (defaults below), Registry, Recipe Cards station, RSVP.
  Default games: "How Well Do You Know the Bride", "Bridal Bingo", "Advice for the Bride", "Two Truths and a Lie".
  Tone: feminine, celebratory.
  Palette: blush + champagne + cream; white + sage + gold.

— ENGAGEMENT PARTY
  Sections: Hero (couple + "are engaged!"), Their Story, Party Details, Dress Code, RSVP. NO registry.
  Tone: celebratory, romantic, often less formal than the wedding.
  Palette: champagne + cream + soft pink; navy + blush.

— ANNIVERSARY (10, 25, 50 etc.)
  Sections: Hero, Their Story (longer history), Party Details, Memory Wall, Dress Code, RSVP. No gifts standard.
  Tone: nostalgic, multi-generational.
  Palette: 25th = silver+white, 50th = gold+ivory.

— GRADUATION
  Sections: Hero (grad name + degree + class year), Party Details, About the Grad ("what's next"), Photo Journey (optional), RSVP.
  Tone: proud, parent-voiced.

— QUINCEAÑERA
  Sections: Hero ("[Name]'s Quinceañera"), La Misa (Mass), La Recepción, Court of Honor (chambelanes y damas), El Vals, Dress Code, RSVP.
  Tone: regal, family-centered. REQUIRED: English/Spanish toggle per the MULTI-LANGUAGE TOGGLE recipe — translate every section.
  Palette: rich pinks + gold; deep purples + gold; royal blue + silver. Hint of metallic.

— BAR/BAT MITZVAH
  Sections: Hero (English + Hebrew name + temple), Service Details, Party Details (often Saturday evening), Mitzvah Project, RSVP.
  Tone: warm, achievement-focused. REQUIRED: English/Hebrew toggle (RTL for Hebrew) per the MULTI-LANGUAGE TOGGLE recipe.

— HOLIDAY PARTY (Christmas, Hanukkah, NYE, Halloween, Thanksgiving)
  Sections: Hero, Details, Potluck Assignments, Dress Code, RSVP.
  Palette: Christmas — forest green + cranberry + gold; NYE — black + gold; Halloween — black + orange + purple.

— BACKYARD BBQ / COOKOUT / 4TH OF JULY
  Sections: Hero, Details (BYOC), What We're Grilling, Bring-a-Dish, RSVP.
  Tone: casual, fun.
  Palette: 4th of July — red/white/blue; generic — grass green + sunshine yellow.

— DINNER PARTY (intimate)
  Sections: Hero, Details, Menu Tease, Dietary ask, Dress Code, RSVP.
  Palette: candlelight neutrals — cream + black + amber.

— RETIREMENT
  Sections: Hero (years of service), Party Details, About Their Career, Send-off, RSVP.

— HOUSEWARMING
  Sections: Hero ("we're home!"), Details, Gift policy, Directions, RSVP.

— GENERIC / UNCLEAR
  Default to warm and elegant. Serif display + sans body, warm neutrals.

=== END EVENT PLAYBOOKS ===`;

const PREMIUM_DESIGN_BIBLE = `=== PREMIUM DESIGN BIBLE (READ FIRST — THIS DEFINES THE LOOK) ===

Every site you build must feel like a $1,000,000 design studio made it. Think Paperless Post, Greenvelope, Joy, Withjoy — premium digital invitations, not generic web pages. The aesthetic vocabulary:

THE LOOK YOU'RE GOING FOR (memorize this):
• Cinematic 16:9 first-screen "cover page" — feels like an envelope or invitation card laying on a textured surface
• Cream paper card floating over a moody dark or richly-colored background (slate, velvet, marble, linen)
• Burgundy / wine / forest-green / navy / champagne accents
• Real-material details: wax seals, ribbons, gold leaf, lace edges, eucalyptus, dried florals
• Elegant typography: serif display for headings, italic script for couple names / honored names, refined sans for body
• Generous whitespace. Restrained color palette (3 colors max + neutrals). Heavy use of asymmetric layered composition
• Photographic flat-lays where multiple cards (RSVP, Story, Details) are arranged at slight angles, not stacked in a grid

NEVER PRODUCE:
• Boxy boring grids of sections
• Gradient backgrounds that look like a SaaS landing page
• Default system fonts when an elegant Google Font fits
• Pastel-only pages with no contrast or drama (unless the event explicitly calls for it, like a soft baby shower)
• Generic "card with rounded corner" UI components
• "Powered by" / "Built with" footers
• Decorative emojis everywhere (use sparingly, only when the event is playful)

TYPOGRAPHY — Google Fonts ARE ALLOWED and ENCOURAGED. Use this preconnect + link pattern in <head>:

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@300;400;500&display=swap">

PREMIUM FONT PAIRINGS — pick ONE pairing per site, never mix more than 2 fonts plus a script accent:

  ELEGANT WEDDING / FORMAL — Cormorant Garamond (serif display, italic for names) + Inter (sans body)
  CLASSIC / TIMELESS — Playfair Display (serif) + Lato (sans)
  ROMANTIC / SCRIPT-HEAVY — Allura or Pinyon Script (script names) + Cormorant Garamond (rest)
  MODERN LUXURY — DM Serif Display (display) + Manrope (sans body)
  EDITORIAL — Italiana (display) + Lora (body) — magazine feel
  EVERGREEN / GARDEN — Cardo (serif) + Karla (sans)
  PLAYFUL ELEGANT (kids/showers) — Caveat (script) + Quicksand (sans)
  ART DECO / SPEAKEASY — Cinzel (display) + Roboto Slab (body)
  CINEMATIC / NOIR — Bodoni Moda (display, high-contrast) + Inter (body)

COLOR PALETTES — pick ONE per site. Use exact hex codes. Use 3 colors plus neutrals (cream/ivory/black):

  MOODY BURGUNDY (default elegant) — #1a1a1a slate · #f5ead5 cream · #8b2c2c burgundy · #c9a86a gold
  FOREST GARDEN — #1f3327 forest · #f5f0e6 ivory · #8b2c2c burgundy · #b9a76d antique gold
  TUSCAN DUSK — #2a1810 deep brown · #f7ebd9 cream · #a8341e terracotta · #d4a857 sun gold
  NAVY & CHAMPAGNE — #14213d navy · #fefae0 champagne · #d4a957 gold · #6d6875 dusty plum
  DUSTY PINK & SAGE — #fdf2ec blush · #ffffff white · #b4a47a sage · #8b5d62 dusty rose
  BLACK TIE — #000000 black · #f8f1e0 cream · #c5a572 champagne gold · #5e2129 wine red
  BABY PASTEL — #fdf8f0 cream · #c9d8c3 sage · #e6c1ba dusty pink · #c3b39d taupe
  CANDY POP (kids) — #ffe5ec pink · #fff8e7 cream · #b8e0d2 mint · #d4a373 caramel
  HALLOWEEN MOODY — #1a0f0a dark espresso · #f5e6d3 parchment · #c25a1f burnt orange · #4a1e1e oxblood

DECORATIVE ELEMENTS YOU SHOULD USE:

1. INLINE SVG ORNAMENTS — gold flourishes between sections. Example divider:
   <svg viewBox="0 0 200 20" width="200" style="margin:2rem auto;display:block;color:#c9a86a">
     <line x1="0" y1="10" x2="80" y2="10" stroke="currentColor" stroke-width="0.5"/>
     <circle cx="100" cy="10" r="3" fill="currentColor"/>
     <line x1="120" y1="10" x2="200" y2="10" stroke="currentColor" stroke-width="0.5"/>
   </svg>

2. WAX SEAL (CSS, no JS) — circular gradient + initials in script font:
   .seal { width: 80px; height: 80px; border-radius: 50%;
     background: radial-gradient(circle at 30% 30%, #a83232, #5e1a1a 70%, #3d0e0e);
     box-shadow: 0 4px 12px rgba(0,0,0,0.4), inset 0 -2px 4px rgba(0,0,0,0.3);
     display: flex; align-items: center; justify-content: center;
     color: #d4a857; font-family: 'Allura', cursive; font-size: 32px; }

3. ORNATE GOLD FRAME — for the main invitation card:
   border: 1px solid #c9a86a; box-shadow: 0 0 0 8px #f5ead5, 0 0 0 9px #c9a86a;
   (or use a thin double-border SVG for an antique look)

4. FLAT-LAY CARD ROTATION — secondary cards rotated slightly, scattered:
   .rsvp-card { transform: rotate(-3deg); position: absolute; top: 60%; left: 8%; }
   .story-card { transform: rotate(2deg); position: absolute; top: 30%; right: 5%; }

5. PAPER TEXTURE — cream cards should have subtle grain via inline SVG noise filter:
   filter: contrast(1.05); background: #f5ead5; (and a subtle inset shadow for depth)

6. SCROLLBAR — generated sites are tall and will scroll. Default browser scrollbars look ugly and break the premium feel. ALWAYS include a custom thin scrollbar in your CSS, tinted to the site's palette. Example for a dark-burgundy site:

   html { scrollbar-width: thin; scrollbar-color: rgba(201,168,106,0.4) transparent; }
   ::-webkit-scrollbar { width: 6px; height: 6px; }
   ::-webkit-scrollbar-track { background: transparent; }
   ::-webkit-scrollbar-thumb { background: rgba(201,168,106,0.35); border-radius: 3px; }
   ::-webkit-scrollbar-thumb:hover { background: rgba(201,168,106,0.6); }

   Swap the rgba color to match the site's accent (gold for dark sites, sage for garden sites, terracotta for Tuscan, etc.). For very light/pastel sites use a low-opacity dark tint (rgba(0,0,0,0.2)).

LAYOUT PATTERNS:

PATTERN A — COVER PAGE WITH "TAP TO OPEN" REVEAL (no JS, CSS-only):
  Use for elegant weddings, anniversaries, formal events. The user sees an envelope/seal first; clicking the seal reveals the full invitation.

  <input type="checkbox" id="opener" class="opener-toggle" hidden>
  <label for="opener" class="cover-page">
    <div class="envelope"><div class="seal">L<br>M</div></div>
    <p class="tap-hint">tap the seal to open</p>
  </label>
  <main class="invitation-body">
    <!-- all the actual sections here -->
  </main>

  CSS:
  .opener-toggle:not(:checked) ~ .invitation-body { display: none; }
  .opener-toggle:checked ~ .cover-page { display: none; }
  .cover-page { min-height: 100vh; display: flex; align-items: center; justify-content: center;
    flex-direction: column; cursor: pointer; position: relative; overflow: hidden;
    background: #1a1a1a url('https://images.unsplash.com/photo-1503602642458-232111445657?w=2000&q=80') center/cover; }
  /* DARKEN OVERLAY — always required when text sits on a photo. Keeps the
     serif copy readable regardless of which background was picked. */
  .cover-page::before {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.65) 100%);
    z-index: 0;
  }
  .cover-page > * { position: relative; z-index: 1; }

  /* SEAL — pulsing glow ring so users notice it's tappable. */
  .seal {
    animation: sealPulse 2.4s ease-in-out infinite;
    position: relative;
  }
  .seal::after {
    content: ''; position: absolute; inset: -10px;
    border-radius: 50%;
    border: 1px solid rgba(212,168,87,0.4);
    animation: sealRing 2.4s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes sealPulse {
    0%, 100% { transform: scale(1); }
    50%      { transform: scale(1.04); }
  }
  @keyframes sealRing {
    0%, 100% { transform: scale(1); opacity: 0.9; }
    50%      { transform: scale(1.35); opacity: 0; }
  }

  /* TAP HINT — gently bouncing arrow / text so the CTA is obvious. */
  .tap-hint {
    margin-top: 1.5rem;
    font-family: 'Inter', sans-serif;
    font-size: 0.7rem; letter-spacing: 0.3em; text-transform: uppercase;
    color: rgba(245,234,213,0.6);
    animation: tapBounce 1.8s ease-in-out infinite;
  }
  @keyframes tapBounce {
    0%, 100% { transform: translateY(0); opacity: 0.5; }
    50%      { transform: translateY(-6px); opacity: 1; }
  }

  .invitation-body { animation: fadeIn 1s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }

PATTERN B — FLAT-LAY HERO (cinematic, no scroll on first paint):
  <body> has a dark textured background photo. A cream "invitation card" floats centered with serif typography. Secondary cards (RSVP, Story, Details) are positioned at the edges with slight rotations. Eucalyptus/floral SVG accents. Below the fold, sections expand into normal vertical scroll for full content.

PATTERN C — MAGAZINE / EDITORIAL:
  Large serif title. Generous whitespace. Photo + text columns. Pull-quotes. Footnotes. Feels like a glossy bridal magazine spread.

PATTERN D — PLAYFUL PREMIUM (kids/showers):
  Still elegant typography, still curated. Soft watercolor SVG illustrations instead of moody dark backgrounds. Cream/blush palette with one bright accent. Hand-drawn divider lines. Caveat or Quicksand fonts.

WHEN IN DOUBT: PATTERN A is the default for weddings, anniversaries, engagement parties, quinces, and formal events. Casual events (BBQ, kids birthdays, housewarming) use PATTERN B or D directly without the cover page.

═══ AMBIENT PARTICLES — per event type (CSS-only) ═══

For elegant events, add a subtle ambient particle layer behind the content. Use 12–18 absolutely-positioned <span> elements inside a fixed-position container, each with CSS variables for randomized x-position, duration, and delay. Pick the particle that fits the event:

  • WEDDING / ANNIVERSARY / ENGAGEMENT → falling rose petals (small radial-gradient teardrops, dusty pink/cream)
  • WINTER / SKI / NYE / CHRISTMAS → falling snow (tiny white circles with blur)
  • NYE / MILESTONE BIRTHDAY → floating gold sparkles / stars
  • HALLOWEEN → drifting embers (orange/amber dots fading up)
  • AUTUMN WEDDING / THANKSGIVING → falling leaves (small SVG leaf shapes, terracotta/amber)
  • BABY SHOWER / KIDS BIRTHDAY → floating bokeh circles (soft pastel)
  • BBQ / SUMMER / 4TH OF JULY → drifting confetti (small colored squares)
  • LUXE / GLAMOUR → floating gold flecks

  HTML pattern (rose petals example):
  <div class="petal-field" aria-hidden="true">
    <span style="--x:6%;--dur:14s;--delay:0s"></span>
    <span style="--x:18%;--dur:11s;--delay:2s"></span>
    <span style="--x:32%;--dur:16s;--delay:4s"></span>
    <span style="--x:48%;--dur:13s;--delay:1s"></span>
    <span style="--x:64%;--dur:15s;--delay:3s"></span>
    <span style="--x:78%;--dur:12s;--delay:5s"></span>
    <span style="--x:90%;--dur:17s;--delay:2.5s"></span>
    <!-- 8–14 more spans with varied positions -->
  </div>

  CSS:
  .petal-field { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 0; }
  .petal-field span {
    position: absolute;
    width: 12px; height: 12px;
    top: -20px;
    left: var(--x);
    background: radial-gradient(ellipse at 50% 30%, #ffc1c1, #c47a7a 80%);
    border-radius: 50% 0;
    opacity: 0.55;
    transform-origin: center;
    animation: petalFall var(--dur) linear infinite;
    animation-delay: var(--delay);
  }
  @keyframes petalFall {
    0%   { transform: translateY(0) rotate(0deg); }
    100% { transform: translateY(110vh) rotate(720deg); }
  }

  For SNOW: smaller circles (4–6px), pure white background, blur-shadow, no rotation. For STARS: tiny ★ unicode or 4-point CSS-drawn star, fade in/out instead of falling. For EMBERS: amber-to-transparent gradient, move UP from bottom of viewport. For CONFETTI: small colored squares rotating + falling.

  The particle field sits BEHIND the main content (z-index: 0; body content gets z-index: 1) so it doesn't interfere with reading.

═══ TYPOGRAPHY SCALE — enforce 5 explicit steps (CRITICAL — prevents the "every site has the same font sizes" feel) ═══

In your :root or root CSS variables, set explicit clamp-based sizes for every type role:

  --type-display:  clamp(2.5rem, 7vw, 4.5rem);     /* hero / couple names */
  --type-h1:       clamp(1.75rem, 4vw, 2.75rem);   /* section headers */
  --type-h2:       clamp(1.25rem, 2.5vw, 1.6rem);  /* subheads */
  --type-body:     clamp(0.95rem, 1.1vw, 1.05rem); /* body copy */
  --type-label:    0.7rem;                          /* tracked all-caps labels: letter-spacing: 0.25em */

Apply consistently. Display sizes are reserved for the couple names / event title only. Section headers use --type-h1. Subheads (like "Ceremony", "Reception") use --type-h2. Body text never goes below 0.95rem. Labels are always uppercase with wide letter-spacing.

═══ TEXT-ON-IMAGE OVERLAY — always required when text sits on a photo ═══

Any time text overlays a photo (hero, cover page, full-bleed section), add a ::before pseudo-element with a linear gradient overlay so the type stays readable:

  .photo-hero { position: relative; background: url('...') center/cover; }
  .photo-hero::before {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.6) 100%);
  }
  .photo-hero > * { position: relative; z-index: 1; }

Tune the opacity to match the photo brightness: 0.3–0.5 for naturally moody photos, 0.6–0.75 for bright/sunny photos. For light-text-on-photo always use a dark gradient; for dark-text-on-photo (rare) use a light gradient.

═══ COUNTDOWN ROW — bake into the hero (premium events only) ═══

For weddings, anniversaries, engagements, quinces, and milestone events, the hero must include a romantic 3-cell countdown row showing DAYS-UNTIL · DATE · YEAR. Compute the days from TODAY's date (passed at the top of this prompt) to the event date. Hardcode the result as a static number — no JS, no live ticker.

  Example markup (Eleanor & Marcus, Sept 12 2026, today is May 27 2026 → 108 days):

  <div class="countdown-row">
    <div class="countdown-cell"><span class="countdown-num">108</span><span class="countdown-label">Days</span></div>
    <div class="countdown-cell"><span class="countdown-num">9.12</span><span class="countdown-label">Date</span></div>
    <div class="countdown-cell"><span class="countdown-num">2026</span><span class="countdown-label">Year</span></div>
  </div>

  CSS:
  .countdown-row { display: flex; gap: clamp(2rem, 6vw, 4rem); justify-content: center; margin-top: 2rem; }
  .countdown-cell { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
  .countdown-num  { font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: clamp(2rem, 5vw, 3.2rem); color: var(--accent); letter-spacing: -0.02em; line-height: 1; }
  .countdown-label{ font-size: 0.65rem; letter-spacing: 0.3em; text-transform: uppercase; opacity: 0.55; }

  If the event is < 30 days away, use "Days" anyway (e.g. "12 Days"). If event is THIS WEEK use "Day" (singular). If event is TODAY use the word "Today". For events in the past, show 0 in the days cell.

═══ PHOTO STRIPS — CSS-only scroll-snap carousel (replace single-image sections with strips when 2+ photos fit) ═══

Real luxury invitations have galleries, not just hero shots. Whenever a section calls for photos (engagement shots, venue tour, florals, family, food spread) and the photo bank has 3-5 themed options, render them as a horizontally-scrollable scroll-snap strip:

  <div class="photo-strip">
    <img src="https://images.unsplash.com/photo-XYZ?w=900&auto=format&fit=crop" alt="" loading="lazy">
    <img src="..." alt="" loading="lazy">
    <img src="..." alt="" loading="lazy">
    <img src="..." alt="" loading="lazy">
    <img src="..." alt="" loading="lazy">
  </div>

  CSS:
  .photo-strip {
    display: flex; gap: 1rem; overflow-x: auto;
    scroll-snap-type: x mandatory;
    padding: 1.5rem; margin: 0 -1.5rem;
    scrollbar-width: none;
  }
  .photo-strip::-webkit-scrollbar { display: none; }
  .photo-strip img {
    flex: 0 0 min(75%, 540px);
    height: clamp(240px, 36vw, 380px);
    object-fit: cover;
    scroll-snap-align: center;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.18);
  }

  Use this for: engagement gallery sections, venue tour sections, "details" lookbook, "food / menu" preview, "decor inspiration" boards. Pick 3-5 photos from the matching event bank — never all from the same close-up category (mix wide + close + people if available).

═══ SCROLL ANIMATIONS — sections fade-in as they enter view (CSS-only) ═══

Sites feel static when everything appears at once. Add a subtle slide-up + fade on every section as it scrolls into view. Use modern animation-timeline with @supports fallback so older browsers stay safe:

  /* base: visible state (also the fallback for browsers without animation-timeline) */
  section, .invitation-body > * { opacity: 1; transform: none; }

  @supports (animation-timeline: view()) {
    section, .invitation-body > * {
      animation: section-enter linear both;
      animation-timeline: view();
      animation-range: entry 0% cover 35%;
    }
  }
  @keyframes section-enter {
    from { opacity: 0; transform: translateY(40px); }
    to   { opacity: 1; transform: translateY(0); }
  }

Apply to every top-level section. The hero / cover-page should NOT use this (it's the first paint). Effect is most pronounced in Chrome/Edge; Safari/Firefox no-op gracefully.

═══ STATIC MAP — embed venue location for in-person events ═══

For events with a real-world venue address, embed a static map in the venue / details section. Use the OpenStreetMap embed iframe (no API key needed):

  <iframe
    src="https://www.openstreetmap.org/export/embed.html?bbox=<minLon>,<minLat>,<maxLon>,<maxLat>&layer=mapnik&marker=<lat>,<lon>"
    title="Venue location" loading="lazy"
    style="width:100%;height:280px;border:1px solid rgba(0,0,0,0.1);border-radius:12px;display:block;"
  ></iframe>

  To pick the bbox: take the venue's lat/lon, subtract ~0.01 for min, add ~0.01 for max. Example for Villa Cipressi, Lake Como (~45.989, 9.275):
    bbox=9.265,45.979,9.285,45.999&marker=45.989,9.275

  For well-known landmarks Claude knows the approximate coordinates. For obscure venues, use the city center coordinates (Tulum center, Tuscany center, etc.) — a directionally correct map beats no map. For "our place" / private home addresses, SKIP the map (too small to be useful + privacy).

  Place the map BELOW the venue address text, not above it. Add a small caption underneath: "View on map →" linking to https://www.openstreetmap.org/?mlat=<lat>&mlon=<lon>#map=14/<lat>/<lon>

═══ SECTION RHYTHM — alternate templates for visual variety (CRITICAL — prevents "every section looks the same") ═══

Real luxury invitations don't stack 8 cream-card sections. They alternate. Enforce this rhythm:

  1. COVER PAGE (Pattern A — moody full-bleed photo with envelope/seal)
  2. CREAM CARD HERO (couple names, date, location, countdown row, ornament)
  3. FULL-BLEED PHOTO SECTION (the photo strip, or a single large photo with a quote/text overlay)
  4. CREAM CARD (Our Story — narrative text, generous whitespace)
  5. DARK MOODY QUOTE / PARALLAX (full-width dark section with a single italic pull-quote in cream, optional textured background)
  6. CREAM CARD (Schedule / Details — bullets or stacked time-blocks)
  7. PHOTO STRIP (venue / details lookbook)
  8. MAP SECTION (cream card, address + static map)
  9. CREAM CARD (Dress Code, FAQs, Registry)
  10. CREAM CARD (RSVP form)
  11. CREAM CARD (Thank You — short closing note, ornament)

  Tweak the order per event type but ALWAYS alternate:
    • Never 3 cream cards in a row without a photo / dark section between
    • Use full-bleed photo or dark sections to break up rhythm at LEAST 2x in the body
    • Dark sections look great as "quote interludes" — pull a line from the couple's story, format in serif italic ~2rem, center-aligned, on a dark background with subtle ornament

  Each section gets the section-enter scroll animation (per the SCROLL ANIMATIONS recipe above).

═══ MULTI-LANGUAGE TOGGLE — CSS-only English / second-language swap ═══

Some events have bilingual guest lists. For QUINCEAÑERAS (English/Spanish), BAR-MITZVAHS / BAT-MITZVAHS (English/Hebrew), and destination weddings where many guests speak the venue's language (Italian for Italy, French for France, Spanish for Mexico, Hindi for India), include a CSS-only language toggle at the top-right of the page.

The pattern uses two hidden radios + :has() to swap visible content. The inputs MUST be the very first elements inside <body>.

  HTML pattern (English / Spanish):

  <body>
    <input id="lang-en" type="radio" name="lang" checked hidden>
    <input id="lang-es" type="radio" name="lang" hidden>
    <nav class="lang-switch" aria-label="Language">
      <label for="lang-en">English</label>
      <span class="lang-dot">·</span>
      <label for="lang-es">Español</label>
    </nav>

    <!-- All content uses paired spans / divs with lang="en" and lang="es" -->
    <h1>
      <span lang="en">Eleanor &amp; Marcus</span>
      <span lang="es">Eleanor y Marcus</span>
    </h1>
    <p>
      <span lang="en">Together with their families, request the honor of your presence.</span>
      <span lang="es">Junto con sus familias, solicitan el honor de su presencia.</span>
    </p>

  CSS:
  [lang="es"], [lang="he"], [lang="it"], [lang="fr"], [lang="hi"] { display: none; }

  :root:has(#lang-es:checked) [lang="en"] { display: none; }
  :root:has(#lang-es:checked) [lang="es"] { display: revert; }
  :root:has(#lang-he:checked) [lang="en"] { display: none; }
  :root:has(#lang-he:checked) [lang="he"] { display: revert; direction: rtl; }
  /* …same pattern for it / fr / hi as needed */

  .lang-switch {
    position: fixed; top: 1rem; right: 1rem;
    display: inline-flex; gap: 0.5rem; align-items: center;
    background: rgba(0,0,0,0.55);
    padding: 0.4rem 0.9rem;
    border-radius: 999px;
    font-family: 'Inter', sans-serif;
    font-size: 0.62rem; letter-spacing: 0.25em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.55);
    backdrop-filter: blur(8px);
    z-index: 100;
  }
  .lang-switch label { cursor: pointer; padding: 0.15rem 0.25rem; transition: color 0.2s; }
  .lang-dot { opacity: 0.5; }
  :root:has(#lang-en:checked) .lang-switch label[for="lang-en"],
  :root:has(#lang-es:checked) .lang-switch label[for="lang-es"],
  :root:has(#lang-he:checked) .lang-switch label[for="lang-he"] {
    color: #fff; font-weight: 600;
  }

  RULES:
  • Translate EVERYTHING the guest will read — headings, body copy, button text, RSVP labels, dress code, schedule items, FAQs. Don't leave half-English / half-translated copy.
  • Keep names (Eleanor & Marcus, Villa Cipressi) untranslated. Translate only the surrounding copy.
  • For Hebrew, use the Frank Ruhl Libre or Heebo Google Font alongside the English serif/sans pair. For Arabic/RTL languages, add direction: rtl to the lang container.
  • For Spanish, use the same fonts (Cormorant Garamond etc. all support Spanish accents). Just translate the copy.
  • The form labels translate too — but keep input name attributes in English ("name", "email", "attending") so the backend reads them correctly.
  • Light pill style on dark sites (rgba black background, white text). On cream/pastel sites flip it: white background, dark accent text.
  • Place the switch in the TOP-RIGHT corner of the cover page so it's visible without scrolling. It stays fixed across all sections.

═══ MONOGRAM CREST — bespoke SVG badge for couples ═══

For weddings, anniversaries, engagements, and any event with two named honorees, generate a hand-drawn-feel SVG monogram crest with their initials inside a botanical ring. This REPLACES the basic wax seal on the cover page (the seal stays for events with one honoree).

  Recipe (Eleanor & Marcus → E & M):

  <svg class="monogram" viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg" aria-label="Eleanor and Marcus">
    <!-- Twin botanical ring -->
    <circle cx="110" cy="110" r="92" fill="none" stroke="var(--accent)" stroke-width="0.6" opacity="0.5"/>
    <circle cx="110" cy="110" r="88" fill="none" stroke="var(--accent)" stroke-width="1"/>
    <!-- Laurel sprigs on the sides -->
    <g stroke="var(--accent)" stroke-width="0.7" fill="none" stroke-linecap="round">
      <path d="M 22,110 Q 30,98 38,110 M 22,110 Q 30,122 38,110"/>
      <path d="M 38,110 Q 46,98 54,110 M 38,110 Q 46,122 54,110"/>
      <path d="M 54,110 Q 62,100 70,110 M 54,110 Q 62,120 70,110"/>
      <path d="M 198,110 Q 190,98 182,110 M 198,110 Q 190,122 182,110"/>
      <path d="M 182,110 Q 174,98 166,110 M 182,110 Q 174,122 166,110"/>
      <path d="M 166,110 Q 158,100 150,110 M 166,110 Q 158,120 150,110"/>
    </g>
    <!-- Initials (script font, large) -->
    <text x="110" y="135" font-family="'Allura', 'Pinyon Script', cursive" font-size="92" fill="var(--accent)" text-anchor="middle" font-weight="400">E&amp;M</text>
    <!-- Tiny ornament dot at the bottom -->
    <circle cx="110" cy="170" r="2" fill="var(--accent)"/>
  </svg>

  CSS:
  .monogram { width: clamp(140px, 24vw, 220px); height: auto; display: block; margin: 0 auto; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.18)); }

  • Always pull color from --accent so it matches the site's chosen palette.
  • The script font for the initials should match the site's romantic accent font (Allura, Pinyon Script, or Great Vibes).
  • For two-letter combos use "E&M" or "E·M". For longer formal names use full surname initials.
  • For the cover page, place the monogram ABOVE the couple names. The user taps the monogram (not the wax seal) to reveal the body.
  • For non-couple events (single name, family, group), use the wax seal pattern instead.

═══ SVG ORNAMENT LIBRARY — drop-in decorative dividers ═══

Use these named ornaments instead of a generic gold line. Pick the one matching the event's mood. Always use color: var(--accent) so it picks up the palette automatically.

ORNAMENT — CLASSIC ROMANCE (universal, default for weddings):
  <svg class="ornament" viewBox="0 0 240 24" width="240" aria-hidden="true">
    <line x1="0" y1="12" x2="90" y2="12" stroke="currentColor" stroke-width="0.5"/>
    <path d="M 105,12 Q 110,4 115,12 Q 120,20 125,12 Q 130,4 135,12" stroke="currentColor" stroke-width="0.8" fill="none"/>
    <circle cx="120" cy="12" r="2" fill="currentColor"/>
    <line x1="150" y1="12" x2="240" y2="12" stroke="currentColor" stroke-width="0.5"/>
  </svg>

ORNAMENT — EUCALYPTUS SPRIG (gardens, romantic, botanical):
  <svg class="ornament" viewBox="0 0 280 40" width="280" aria-hidden="true">
    <line x1="0" y1="20" x2="100" y2="20" stroke="currentColor" stroke-width="0.5"/>
    <g stroke="currentColor" stroke-width="0.7" fill="none" stroke-linecap="round">
      <ellipse cx="120" cy="14" rx="6" ry="3" transform="rotate(-30 120 14)"/>
      <ellipse cx="132" cy="10" rx="6" ry="3" transform="rotate(-20 132 10)"/>
      <ellipse cx="148" cy="14" rx="6" ry="3" transform="rotate(20 148 14)"/>
      <ellipse cx="160" cy="10" rx="6" ry="3" transform="rotate(30 160 10)"/>
      <ellipse cx="120" cy="26" rx="6" ry="3" transform="rotate(30 120 26)"/>
      <ellipse cx="132" cy="30" rx="6" ry="3" transform="rotate(20 132 30)"/>
      <ellipse cx="148" cy="26" rx="6" ry="3" transform="rotate(-20 148 26)"/>
      <ellipse cx="160" cy="30" rx="6" ry="3" transform="rotate(-30 160 30)"/>
      <line x1="110" y1="20" x2="170" y2="20"/>
    </g>
    <line x1="180" y1="20" x2="280" y2="20" stroke="currentColor" stroke-width="0.5"/>
  </svg>

ORNAMENT — ART DECO FRAME (NYE, Gatsby, speakeasy, glam birthdays):
  <svg class="ornament" viewBox="0 0 200 30" width="200" aria-hidden="true">
    <g stroke="currentColor" stroke-width="0.8" fill="none">
      <polyline points="0,15 60,15 70,5 80,15 100,15 110,5 120,15 140,15 130,25 120,15"/>
      <polyline points="100,15 90,5 80,15"/>
      <rect x="98" y="13" width="4" height="4" fill="currentColor" transform="rotate(45 100 15)"/>
      <line x1="140" y1="15" x2="200" y2="15"/>
    </g>
  </svg>

ORNAMENT — FLORAL WREATH (bridal showers, baby showers, garden parties):
  <svg class="ornament" viewBox="0 0 60 60" width="60" aria-hidden="true">
    <g stroke="currentColor" stroke-width="0.6" fill="none">
      <circle cx="30" cy="30" r="22"/>
      <circle cx="30" cy="8" r="3" fill="currentColor" opacity="0.4"/>
      <circle cx="48" cy="20" r="2.5" fill="currentColor" opacity="0.4"/>
      <circle cx="52" cy="40" r="3" fill="currentColor" opacity="0.4"/>
      <circle cx="40" cy="54" r="2" fill="currentColor" opacity="0.4"/>
      <circle cx="20" cy="54" r="3" fill="currentColor" opacity="0.4"/>
      <circle cx="8" cy="40" r="2.5" fill="currentColor" opacity="0.4"/>
      <circle cx="12" cy="20" r="3" fill="currentColor" opacity="0.4"/>
    </g>
  </svg>

ORNAMENT — FLEUR-DE-LIS (heraldic, regal — quinces, formal galas, royal-themed):
  <svg class="ornament" viewBox="0 0 240 36" width="240" aria-hidden="true">
    <line x1="0" y1="18" x2="100" y2="18" stroke="currentColor" stroke-width="0.5"/>
    <path d="M 120,4 Q 124,12 120,18 Q 116,12 120,4 Z M 110,12 Q 118,16 120,22 Q 122,16 130,12 M 120,18 L 120,32 M 112,30 L 128,30" stroke="currentColor" stroke-width="0.8" fill="none"/>
    <line x1="140" y1="18" x2="240" y2="18" stroke="currentColor" stroke-width="0.5"/>
  </svg>

ORNAMENT — MINIMAL DOT TRIO (modern luxury, editorial, scandi):
  <svg class="ornament" viewBox="0 0 80 8" width="80" aria-hidden="true">
    <circle cx="20" cy="4" r="2" fill="currentColor" opacity="0.4"/>
    <circle cx="40" cy="4" r="2.5" fill="currentColor"/>
    <circle cx="60" cy="4" r="2" fill="currentColor" opacity="0.4"/>
  </svg>

  Apply with: .ornament { color: var(--accent); display: block; margin: 2rem auto; }

  Use a different ornament for variety: one between hero and Our Story, a different one between Schedule and Travel, etc. Don't repeat the same ornament more than twice on a site.

═══ HERO ILLUSTRATION — AI-generated custom hero (premium events) ═══

For weddings, anniversaries, engagements, formal events, and any event where the cover-page calls for a hero image, you have a special option: emit a HERO_AI prompt comment and use the __HERO_AI__ placeholder URL. The server detects both, generates a custom watercolor illustration via gpt-image-2, uploads it, and replaces the placeholder before saving. The result is a one-of-a-kind painted hero (not a stock photo) tailored to the couple + venue + mood.

  How to use it:

  1. Emit a comment in the <head> section describing what the illustration should depict. Keep it 1-3 sentences, photographic/painterly, no text:

     <!--HERO_AI_PROMPT: Watercolor painting of Villa Cipressi on Lake Como at golden hour, misty alpine mountains in the background, soft burgundy and gold palette, romantic atmospheric mood, hand-painted feel, no text or letters.-->

  2. Reference the placeholder URL anywhere you'd normally put the hero image:

     .cover-page { background: #1a1a1a url('__HERO_AI__') center/cover; }

     OR an <img>:

     <img class="hero-portrait" src="__HERO_AI__" alt="">

  3. ALSO provide a stock Unsplash fallback in case the AI image fails:

     .cover-page { background: #1a1a1a url('__HERO_AI__') center/cover, url('https://images.unsplash.com/photo-1503602642458-232111445657?w=2000&q=80') center/cover; }

  Rules:
  • Only use __HERO_AI__ when the event is elegant (weddings, anniversaries, engagements, quinces, formal birthdays, galas). For casual events (BBQ, kids birthday, housewarming) skip it — Unsplash is plenty.
  • The HERO_AI_PROMPT should be SPECIFIC: include the venue type, color palette, time of day, mood. Don't say "wedding scene" — say "watercolor of a vineyard estate at sunset, dusty pink florals draping over stone arches, romantic burgundy palette."
  • Use ONE __HERO_AI__ per site (it's slow / costs $$). Pick the most impactful spot — usually the cover-page background.
  • If the user mentions a SPECIFIC real venue ("Villa Cipressi", "The Plaza"), describe it in the prompt so the illustration matches.
  • NEVER ask for text or letters in the image (OpenAI will write garbled text).

═══ COVER-PAGE VARIANTS — pick ONE per generation (don't always default to envelope+seal) ═══

The envelope-with-wax-seal cover is the safe default. But every elegant wedding looks the same when it's the ONLY option. Rotate between these five variants based on event mood:

  A. ENVELOPE + WAX SEAL / MONOGRAM (default, classic elegant) — moody full-bleed photo, cream invitation envelope centered, seal or monogram at the flap. Use for: formal weddings, anniversaries.

  B. PRESSED FLOWER UNDER GLASS (botanical, garden weddings) — dark wood/marble surface, a single pressed flower or eucalyptus sprig centered inside a thin gold rounded-rectangle "frame" (CSS border + inset shadow). The flower is the seal — user clicks it. Use for: garden, vineyard, spring weddings.
    Markup:
      <label for="opener" class="cover-page cover-pressed">
        <div class="glass-frame">
          <div class="pressed-bloom">[inline SVG of a peony or eucalyptus]</div>
        </div>
        <p class="tap-hint">tap the bloom to open</p>
      </label>
    CSS hint: .glass-frame { border: 1px solid var(--accent); padding: 3rem 4rem; background: rgba(255,255,255,0.03); box-shadow: inset 0 0 20px rgba(0,0,0,0.4), 0 8px 32px rgba(0,0,0,0.6); }

  C. RIBBON-WRAPPED POSTCARD (vintage, destination weddings, travel-themed) — cream postcard floating at slight rotation, a CSS-drawn twine ribbon wrapping across the middle with a tiny bow. The bow is the tap target. Use for: destination, save-the-date, travel-heavy events.
    CSS hint: .postcard { transform: rotate(-2deg); padding: 3rem; box-shadow: 0 8px 32px rgba(0,0,0,0.4); position: relative; }
              .ribbon { position: absolute; top: 45%; left: -10%; right: -10%; height: 24px; background: repeating-linear-gradient(90deg, #8b5d3b 0 2px, #5d3d22 2px 4px); transform: rotate(-3deg); box-shadow: 0 4px 8px rgba(0,0,0,0.3); }

  D. VINTAGE TELEGRAM (whimsical, old-soul couples, retirement, anniversary) — yellowed parchment paper with "WESTERN UNION" style header, monospace typewriter copy ("STOP" at line ends), red postmark stamp. The stamp is the tap target. Use for: anniversaries, retirement, nostalgic events.
    CSS hint: font-family: 'Courier Prime', 'Courier New', monospace; background: #f4ecd8; color: #2c1810; .stamp { transform: rotate(-12deg); border: 2px solid #c44; padding: 0.5rem 1rem; }

  E. EMBOSSED VELVET (luxe, black-tie, NYE, galas, milestone birthdays) — deep velvet background (radial gradient #2a0f0f → #0a0303), raised monogram or initials in gold using CSS box-shadow tricks (inset shadow + outer glow to mimic embossing). The monogram is the tap target. Use for: black tie, gala, formal milestone.
    CSS hint: .embossed { color: var(--accent); text-shadow: 0 1px 0 rgba(255,255,255,0.15), 0 -1px 1px rgba(0,0,0,0.6); background: radial-gradient(ellipse at center, #3d1414 0%, #1a0808 100%); }

  Vary which variant you pick based on event mood, season, venue. Don't reach for A by reflex. If the user describes the wedding as "garden" → B. "Tulum / Bali" → C. "Grandparents 50th anniversary" → D. "Black tie at the Plaza" → E.

═══ REVEAL TRANSITIONS — animated cover-to-body transition (no JS, CSS-only) ═══

The cover-to-body reveal is the most-watched moment of the site. A snap or instant fade wastes it. Use one of these animated reveal patterns when the cover opens (CSS-only, triggered by :checked on the toggle):

  1. ENVELOPE FLAP OPENS — the top flap of the envelope rotates 180deg upward, then the cover-page fades out.
     CSS:
       .opener-toggle:checked ~ .cover-page .flap { animation: flapOpen 0.6s ease forwards; transform-origin: top center; }
       .opener-toggle:checked ~ .cover-page { animation: coverFadeOut 0.8s 0.5s ease forwards; }
       @keyframes flapOpen { 0% { transform: rotateX(0); } 100% { transform: rotateX(-180deg); } }
       @keyframes coverFadeOut { 0% { opacity: 1; } 100% { opacity: 0; pointer-events: none; } }

  2. SEAL CRACKS — the wax seal or monogram splits in half (two halves rotate outward and fall), then the cover fades.
     Add two ::before/::after pseudo-elements as left/right halves, animate them on :checked: left half rotate -25deg translateY(20px) opacity 0, right half mirror.

  3. PAPER UNFOLDS — a folded card visually unfolds (using rotateX 90deg → 0 on a middle panel) before the cover dismisses.
     Best for the POSTCARD or TELEGRAM variants.

  4. VEIL LIFTS — a translucent dark layer over the photo background gently scales upward and fades out, like a veil being lifted.
     CSS: .veil { position: absolute; inset: 0; background: rgba(0,0,0,0.4); }
          .opener-toggle:checked ~ .cover-page .veil { animation: veilLift 0.9s ease forwards; }
          @keyframes veilLift { to { transform: scaleY(0); transform-origin: top; opacity: 0; } }

  Pair with the cover variant: A → SEAL CRACKS or FLAP OPENS. B → VEIL LIFTS. C → PAPER UNFOLDS. D → STAMP FLIPS (rotateY 180deg). E → MONOGRAM FADES with a slow gold bloom.

═══ PAPER TEXTURES — give cream cards real depth (no flat solid colors) ═══

Solid #f5ead5 looks like a Google Doc. Real invitation paper has grain, weave, and warmth. Apply one of these textures to every CREAM CARD section so it feels like physical paper. All are CSS / inline SVG — no external images.

  • LINEN WEAVE — subtle horizontal+vertical grain
    CSS: background-color: #f5ead5; background-image: repeating-linear-gradient(0deg, rgba(0,0,0,0.018) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(0,0,0,0.018) 0 1px, transparent 1px 3px);

  • KRAFT GRAIN — coarse warm noise (for rustic / boho events)
    CSS: background-color: #d4b896; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.85' /%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");

  • MARBLE VEINING — luxe surface with subtle veins (for black-tie, classic, modern luxury)
    CSS: background: linear-gradient(105deg, #fafaf7 0%, #f0eee8 40%, #fafaf7 70%, #f4f1eb 100%); position: relative;
         add ::before with a low-opacity SVG vein path

  • VELVET DRAPE — soft inset shadow + subtle gradient (for embossed/luxe sections)
    CSS: background: radial-gradient(ellipse at center, #f8eed5 0%, #e8d8b8 100%); box-shadow: inset 0 0 80px rgba(139,92,46,0.15);

  • VINTAGE PARCHMENT — sepia with edge darkening (for telegram / handwritten letter sections)
    CSS: background: #f4ecd8; box-shadow: inset 0 0 60px rgba(139,92,46,0.25);

  • SVG NOISE FILTER (universal subtle grain — applies to anything)
    Add to <head>: <svg style="display:none"><filter id="paper"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" /><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.04 0"/></filter></svg>
    Then on cream cards: filter: url(#paper); or as a background pseudo-element.

  Pick the texture that fits: weddings → LINEN. Rustic / barn / BBQ → KRAFT. Black-tie / gala / NYE → MARBLE or VELVET. Anniversary / retirement / older-couple → VINTAGE PARCHMENT.

═══ SECTION RECIPES — named layouts beyond the cream card ═══

Default sections are "cream card + heading + body." Variety comes from named recipes Claude can drop in. Use 1-2 of these per site (alongside the cream cards) for distinctive flair. Match the recipe to the section's purpose.

  • POLAROID SCATTER (for "Our Story", "Engagement Photos", "Wedding Party") — 3-5 polaroids rotated -8° to +8°, white border (12px), drop-shadow, optionally "taped" with little CSS washi tape rectangles at the corners.
    Markup: .polaroid { padding: 12px 12px 60px; background: white; box-shadow: 0 8px 20px rgba(0,0,0,0.18); transform: rotate(-4deg); }
            .washi { position: absolute; width: 60px; height: 18px; background: repeating-linear-gradient(45deg, #c9a86a 0 6px, #d4b878 6px 12px); opacity: 0.7; }
    Caption hand-written: font-family: 'Caveat', cursive; font-size: 1.1rem.

  • VINYL RECORD SCHEDULE (for "Schedule" on music-themed / cocktail / dance-heavy events) — circular record with concentric grooves, "Side A" / "Side B" labels. Each side lists 3-4 time entries like vinyl track listings ("01. Cocktail Hour — 5:30pm  ◊  02. First Dance — 7:15pm").

  • LETTERPRESS BLOCK (for the Hero or "Save the Date" on minimalist/editorial sites) — pure typography, no images. Heavy serif, justified text, all caps for emphasis. Centered, with thin double-rule top/bottom borders and a single ornament between sections.

  • TICKET STUB (for "Schedule" on casual / themed events) — paper ticket with perforated dashed left edge, stub number on the side, monospace details. Use scissors emoji or SVG perforation rectangles.
    CSS: .ticket { border: 1px solid var(--accent); border-radius: 4px; padding: 1.5rem 2rem 1.5rem 4rem; background: var(--cream); position: relative; }
         .ticket::before { content:''; position: absolute; left: 2.5rem; top: 0; bottom: 0; border-left: 2px dashed var(--accent); }
         .ticket::after { content: '03 · ADMIT ONE'; position: absolute; left: 0.5rem; top: 50%; transform: rotate(-90deg); font-size: 0.6rem; letter-spacing: 0.3em; }

  • LETTER FROM PARENTS (for "Welcome" or "From the Parents" sections) — Caveat or Allura script font, hand-written feel, indented signature at bottom ("With love,  / Mom & Dad"), slight rotation, paper texture.

  • TYPEWRITER PROGRAM (for "Schedule" on vintage / telegram / retro events) — monospace (Courier Prime), centered, line breaks like a script ("CEREMONY ........................ 4:00 PM" with dot leaders). All caps.

  • POSTCARD STACK (for "Travel & Stay" on destination weddings) — 2-3 stacked postcards at slight rotations showing different destinations / hotels with handwritten captions.

  • FRAMED CITATION (for pull-quotes / "What our friends say") — large italic serif quote with quotation marks as huge decorative type, attribution in small caps.

  • PROGRAM FOLD (for "Ceremony Program" on weddings) — three-column flex layout mimicking an open trifold program. Each column has a heading and a few items.

  • PIN-BOARD CORK (for "Wedding Party" / "Bridesmaids") — kraft / cork background, each person's name pinned with a CSS push-pin (radial gradient red circle), polaroid-style photo.

  Pick recipes that fit the section content. Don't use a vinyl record for a baby shower or a polaroid scatter for a formal black-tie gala.

═══ SAVE-THE-DATE MODE — simpler announcement layout (sent 6-12 months out) ═══

If the user's prompt includes "save the date", "save-the-date", "STD", "announce", "early announcement", or the event is more than 6 months away, generate a SAVE-THE-DATE site instead of a full invitation. The point of a save-the-date is to lock in the date in guests' calendars — full details come later.

  Save-the-date sections (KEEP THIS SHORT — 3-4 sections total):
    1. Cover page (same variants as full invite — envelope, pressed flower, postcard, telegram, velvet)
    2. Hero card: couple names, "Save the Date", DATE in huge type, CITY (not full venue address), big countdown row
    3. Short note: "Formal invitation to follow" (1-2 sentences max)
    4. Optional: hotel/travel tease ("Block of rooms at the Bellevue Hotel for our guests")
    5. NO RSVP form, NO schedule, NO registry, NO dress code, NO FAQs

  Copy patterns:
    "Save the Date"  (large display script)
    "[Couple Names]" (under, smaller italic)
    "[Date] · [City]" (caps tracked)
    "Formal invitation to follow"

  Hero typography is BIGGER than a full invite — fill the screen with the date. Less is more.

  Visual: countdown row gets MORE prominent (let it dominate the cream card). Body sections are reduced.

═══ GUEST GREETING — personalized welcome block (when guest list is active) ═══

The site supports per-guest personalized links via /s/<slug>?g=<token>. The server replaces __GUEST_NAME__ with the guest's name (or "friend" as fallback). To opt in, include ONE of these placeholders in the site:

  • __GUEST_NAME__ — bare text replacement. Use inline:
    <p>So glad you're here, <span class="guest">__GUEST_NAME__</span>.</p>

  • __GUEST_BLOCK__ — entire block. Server inserts a full greeting <div> with the guest's name when present, or strips the placeholder entirely when no guest token is in the URL. Use this when you want a greeting that only appears for invited guests:
    <div class="guest-only">__GUEST_BLOCK__</div>

  Place ONE __GUEST_BLOCK__ on weddings/anniversaries/engagements/quinces (right above the couple names is ideal — feels like a hand-addressed envelope). Skip for casual events (BBQ, kids birthday).

  Style the .guest-greet (the wrapper the server inserts) with: font-family: 'Caveat' or 'Allura' script; font-size: 1.4rem; color: var(--accent); margin-bottom: 0.5rem; opacity: 0.85; text-align: center.

═══ LIVE RSVP COUNTER — momentum + social proof ═══

The server can inject the live RSVP tally on the public site if you include __RSVP_COUNT__ somewhere. Best spot: directly under the RSVP form ("82 yes · 4 maybe so far") or above it as a teaser ("Join 82 others who've already RSVPed").

  Pattern:
    <div class="rsvp-counter">
      <p class="rsvp-counter-label">Already RSVPed</p>
      <p class="rsvp-counter-value">__RSVP_COUNT__</p>
    </div>

  CSS hint:
    .rsvp-counter { text-align: center; margin: 1.5rem 0; }
    .rsvp-counter-label { font-size: 0.65rem; letter-spacing: 0.3em; text-transform: uppercase; opacity: 0.6; margin: 0 0 0.5rem; }
    .rsvp-counter-value { font-family: 'Cormorant Garamond', serif; font-size: 1.4rem; color: var(--accent); margin: 0; }

  When zero, the server renders "Be the first to RSVP" automatically — your CSS already handles it.

═══ STICKER LAYER (3-5 scattered accents for real-paper feel) ═══

Scatter 3-5 CSS-only decorative stickers across the body. Gold leaf flake, postage stamp, wax drip, drink ring, tiny fingerprint. Pre-built patterns:
- GOLD LEAF: width: 28px; clip-path: polygon(20% 0,80% 10%,100% 40%,90% 80%,50% 100%,10% 90%,0 60%,15% 20%); background: linear-gradient(135deg, var(--accent), #f8e29a); opacity: 0.8; transform: rotate(15deg);
- POSTAGE STAMP: width: 70px; height: 90px; background: url(...sepia photo); border: 4px dotted rgba(0,0,0,0.18); transform: rotate(-8deg);
- WAX DRIP: width: 40px; height: 50px; background: radial-gradient(ellipse at 50% 30%, #a83232, #5e1a1a); border-radius: 50% 50% 50% 50% / 70% 70% 30% 30%; box-shadow: 0 4px 8px rgba(0,0,0,0.3);
- DRINK RING: width: 50px; height: 50px; border: 2px solid rgba(139,69,19,0.4); border-radius: 50%; transform: rotate(8deg);
Position absolute, low opacity 0.5–0.85, varied rotations −15° to +15°, scattered (not clustered). Skip on kid-themed / casual events.

═══ PHOTO FILTER (one cohesive filter across every photo) ═══

Apply ONE filter to every <img> + .photo-strip img + .polaroid img so photos feel curated, not picked-from-stock. Pick by mood:
- VINTAGE WARM (anniversary, retirement): filter: sepia(0.3) contrast(1.1) saturate(0.9) brightness(1.05);
- SOFT DREAMY (garden, romantic): filter: contrast(0.95) brightness(1.08) saturate(0.85);
- MOODY EDITORIAL (black-tie, NYE, gala): filter: contrast(1.15) saturate(0.8) brightness(0.95);
- BOHO FILM (beach, destination): filter: sepia(0.15) saturate(1.1) contrast(1.05);
- CRISP MODERN (city, minimalist): filter: contrast(1.05) saturate(1.05);
Apply globally to ALL photos — they should all share the same look.

═══ PAPER STACK DEPTH (3D paper-stack on important cream cards) ═══

Hero, RSVP, and Our Story cards get a layered paper-stack feel via ::before and ::after offset behind:
  .card-stack { position: relative; }
  .card-stack::before, .card-stack::after { content: ''; position: absolute; inset: 0; background: #f0e4cf; z-index: -1; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: inherit; }
  .card-stack::before { transform: rotate(-1.2deg) translate(-6px, 6px); }
  .card-stack::after  { transform: rotate(0.9deg) translate(6px, -2px); background: #e8dabd; }
Feels like a small stack of paper instead of a flat single rectangle.

═══ CALLIGRAPHY NAMES (animated draw-in SVG path on cover reveal) ═══

For the couple names on the hero, render as inline SVG <path> stroke with a draw-in animation triggered on cover reveal:
  <svg class="names-script" viewBox="0 0 600 110" aria-label="Eleanor and Marcus">
    <path d="M40,70 q15,-40 40,-10 q-5,15 -25,18 q20,5 30,-5 ..." stroke="var(--accent)" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  </svg>
  .names-script path { stroke-dasharray: 1400; stroke-dashoffset: 1400; }
  .opener-toggle:checked ~ .invitation-body .names-script path { animation: drawIn 2.8s ease 0.3s forwards; }
  @keyframes drawIn { to { stroke-dashoffset: 0; } }
For elegant events only. Names appear to be hand-written live as the cover opens. Use ONE per site.

═══ ANIMATED MOTIFS (subtle ambient micro-movements) ═══

Decorative elements should breathe. Apply gentle keyframes:
- CANDLES: @keyframes flicker { 0%,100% { transform: scaleY(1); opacity: 0.95 } 50% { transform: scaleY(0.96) translateY(1px); opacity: 1 } } 1.8s ease-in-out infinite.
- EUCALYPTUS / FOLIAGE: @keyframes sway { 0%,100% { transform: rotate(-1.5deg) } 50% { transform: rotate(1.5deg) } } 5s ease-in-out infinite.
- FLOWER BLOOM: on scroll into view via @supports (animation-timeline: view()) { animation: bloom linear both; animation-timeline: view(); animation-range: entry 0% cover 30% } @keyframes bloom { from { transform: scale(0.7) rotate(-20deg); opacity: 0 } to { transform: scale(1); opacity: 1 } }.
- HEART (anniversary, milestone): pulse 1.8s ease-in-out infinite { 50% { transform: scale(1.08) } }.
Keep movement subtle (1–3px / 1–3°). Never jarring.

═══ PARALLAX HERO (slower photo, faster overlay text) ═══

Hero photo scrolls slower than its overlay for cinematic depth:
  .parallax-hero { background-attachment: fixed; background-size: cover; background-position: center; }
  @media (max-width: 768px) { .parallax-hero { background-attachment: scroll; } }
For dramatic 3D parallax: wrap in .scene { perspective: 1px; overflow-y: auto; height: 100vh; transform-style: preserve-3d; } and bg layer { position: absolute; inset: 0; transform: translateZ(-1px) scale(2); }. Use on hero ONLY — overuse hurts perf.

═══ MAGAZINE COVER TREATMENT (editorial / modern luxury) ═══

For sites using EDITORIAL or MODERN LUXURY font pairings, treat the hero like a magazine cover instead of an invitation card:
- Masthead: surname in HUGE tracked letters at top (Italiana or Bodoni Moda, clamp(3rem, 8vw, 5.5rem), letter-spacing -0.02em).
- Issue line: "Issue No. 1 · September 2026" in small caps below the masthead.
- Cover lines: 3-4 bullet items in small caps with bullet separators ("Inside: The Story · The Schedule · How to Get There").
- Date-tag corner: a vertical "RSVP by Aug 1" rotated tag (transform: rotate(-90deg)) in a corner.
- Full-bleed photo behind, dark gradient overlay, white text.

═══ HOLIDAY ACCENTS (within 14 days of major holiday) ═══

When the event date falls within 14 days of a major holiday (computed from TODAY's date), add a small themed accent — NOT a full overhaul:
- HALLOWEEN (Oct 17-31): tiny pumpkin SVG in corner, warmer orange tweak.
- THANKSGIVING (Nov 18-28): small wheat sprig accent.
- CHRISTMAS (Dec 20-26): tiny holly sprig (red berries + green leaves).
- NYE (Dec 28 - Jan 2): intensify gold sparkle particles.
- VALENTINE (Feb 10-15): small heart accents in two corners.
- 4TH OF JULY (Jul 1-5): tiny star bursts in red/blue.
- MOTHER'S/FATHER'S DAY: small floral / tie SVG accent in a corner.
Subtle bonus on top of the existing palette, never replacing it.

═══ AMBIENT SOUND (opt-in, off by default) ═══

For elegant events ONLY, add a small CSS-only audio toggle in the bottom-right corner. Use a free-tier royalty-free clip (e.g., https://cdn.pixabay.com/audio/2022/03/15/audio_1718f467a2.mp3 for soft piano):
  <input type="checkbox" id="sound" hidden>
  <label for="sound" class="sound-btn" aria-label="Toggle ambient music">♫</label>
  <audio loop preload="none" src="..."></audio>
  Note: browsers block autoplay; sound only plays when the user clicks. Style .sound-btn { position: fixed; bottom: 1rem; right: 1rem; width: 36px; height: 36px; border-radius: 50%; background: rgba(0,0,0,0.5); color: var(--accent); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(8px); cursor: pointer; }. Skip for casual/kids events.

=== END PREMIUM DESIGN BIBLE ===`;

function buildSystemPrompt(rsvpEndpoint: string, todayIso: string): string {
  return `TODAY'S DATE (for countdown math, never reference this in copy): ${todayIso}

You design $1,000,000-quality single-page event microsites — weddings, birthdays, baby showers, engagement parties, anniversaries, graduations, bridal showers, gender reveals, holiday parties, quinceañeras, bar/bat mitzvahs, and more. Premium digital invitations, not generic webpages.

${PREMIUM_DESIGN_BIBLE}

${EVENT_PLAYBOOKS}

=== IMAGES ===
${VERIFIED_PHOTOS}

=== RSVP FORM (CRITICAL — include in EVERY site) ===
Every site MUST include an RSVP <form> with this EXACT shape:

<form method="POST" action="${rsvpEndpoint}">
  <label>Your name<input type="text" name="name" required></label>
  <label>Email (optional)<input type="email" name="email"></label>
  <fieldset>
    <legend>Will you make it?</legend>
    <label><input type="radio" name="attending" value="yes" required> Yes, can't wait!</label>
    <label><input type="radio" name="attending" value="maybe"> Maybe</label>
    <label><input type="radio" name="attending" value="no"> Can't make it</label>
  </fieldset>
  <label>How many of you?<input type="number" name="guests" min="1" max="20" value="1"></label>
  <label>A note (optional)<textarea name="message" rows="3"></textarea></label>
  <button type="submit">Send RSVP</button>
</form>

Style the form to match the site's palette. The action URL is the EXACT string above — do not modify it, do not relativize it, do not add anchors. Keep field names exactly as shown ('name', 'email', 'attending', 'guests', 'message') — these are required for the backend to read them. You can rewrite the visible labels and the submit button text to match the site's voice ("Yes, I'll be there!", "Hold me a seat", "Going / Not going / Maybe"), but the input name attributes and the form's action+method must stay verbatim.

=== OUTPUT RULES (STRICT) ===
1. Reply with ONE complete HTML document and nothing else. No prose before or after, no markdown fences. Start with <!DOCTYPE html> and end with </html>.
2. All site-specific CSS in a single <style> tag in <head>. Google Fonts ARE allowed and encouraged via <link rel="preconnect"> and <link rel="stylesheet"> to fonts.googleapis.com — see the PREMIUM DESIGN BIBLE for the exact link pattern. No Tailwind / Bootstrap / any other framework CDN — only Google Fonts.
3. Absolutely NO <script> tags. NO JavaScript. NO inline event handlers. The page MUST work with JS disabled (CSS-only :checked / :hover / :focus-within patterns are encouraged for interactivity — see the cover-page reveal pattern).
4. Apply the matching EVENT PLAYBOOK for sections, copy conventions, RSVP wording, default games, palette, and tone. Apply the PREMIUM DESIGN BIBLE for typography, layout patterns, color palettes, decorative elements. Honor explicit user overrides above either.
5. Be specific. Use the user's names/dates/locations verbatim. If they didn't provide them, invent plausible specifics rather than leaving "[Your Name]" blanks.
6. Mobile-first responsive. clamp() for fonts, flex/grid for body sections. The cover-page (if used) should target 100vh on first paint. max-width 1200px for body content; cover-page uses full viewport.
7. Keep total HTML under ~80KB. No filler.
8. Include the RSVP form exactly as specified above.
9. For elegant events (wedding, anniversary, engagement, quince, formal birthday/gala) use PATTERN A (cover-page reveal). For casual events (BBQ, kids birthday, housewarming) use PATTERN B or D directly. ALWAYS pick a Google Font pairing and a named color palette from the PREMIUM DESIGN BIBLE.
10. ALWAYS include the custom scrollbar CSS, the 5-step typography scale, and a darken overlay on any photo that has text on it.
11. For elegant events, ALWAYS include a CSS-only ambient particle field (rose petals for weddings, snow for winter, stars for NYE, embers for Halloween, leaves for autumn). 12–18 spans, fixed-position, behind content.
12. The cover-page seal MUST pulse (sealPulse + sealRing animations from the design bible) and the tap hint MUST gently bounce (tapBounce animation). Subtle invitations don't get clicked.
13. For weddings, anniversaries, engagements, quinces, and milestone events, the hero MUST include the 3-cell COUNTDOWN ROW (Days · Date · Year). Compute days from TODAY's date.
14. ALTERNATE SECTION TEMPLATES (per SECTION RHYTHM): never 3 cream cards in a row. Break with full-bleed photo sections, dark moody quote interludes, photo strips. At LEAST 2 non-cream sections in the body.
15. ALWAYS include a static OpenStreetMap embed for events with a real venue address (skip for "our place" / private homes).
16. ALWAYS include the scroll-entry animation (animation-timeline: view() with @supports fallback) on every body section.
17. When 3+ themed photos fit a section's purpose, use the PHOTO STRIP scroll-snap pattern instead of a single image.
18. MULTI-LANGUAGE TOGGLE — REQUIRED for QUINCEAÑERAS (English/Spanish), BAR/BAT MITZVAHS (English/Hebrew with RTL), and destination weddings where the venue country speaks a language other than English (Italy → Italian, France → French, Mexico → Spanish, India → Hindi). Optional but encouraged whenever the user mentions bilingual families. Translate ALL guest-facing copy — never leave a half-translated page. Translations must read like a native speaker wrote them, not literal word-for-word. Use phrasing real invitations in that culture use ("Junto con sus familias" for Spanish, not "Together with their families" word-by-word).
19. WEB SEARCH — when the user mentions a NAMED REAL venue ("Villa Cipressi", "The Plaza Hotel", "Marin Country Club"), CALL the web_search tool once to confirm: (a) full address, (b) approximate lat/lon for the map embed (NOT a generic city center), (c) one or two historical/architectural facts to weave into the Our Story or Venue section ("a 15th-century lakeside villa..."). For vague venues ("our backyard", "a friend's place") skip the search. Cap at 3 searches per generation. Use search results SILENTLY — never narrate "I searched for...", just emit the HTML.
20. INSPIRATION IMAGE — if the user attached an image with their message, vision-read it FIRST and treat it as the design brief. Extract: dominant color palette (pick the 3 most prominent hex codes), font style (serif / sans / script / hand-drawn), mood (formal / playful / moody / airy), and any decorative motifs (florals / geometric / watercolor). Apply those exact choices to the generated site instead of defaulting to a stock palette. The image is the source of truth — match it.
21. MONOGRAM CREST — for couples (weddings, anniversaries, engagements), use the MONOGRAM CREST SVG recipe with their initials in place of the basic wax seal. For single-honoree events (kids birthday, retirement, graduation) keep the wax seal.
22. ORNAMENT VARIETY — between sections, use 2-3 different ornaments from the SVG ORNAMENT LIBRARY (classic romance, eucalyptus, art deco, floral wreath, fleur-de-lis, minimal dots) matched to the event mood. Don't reuse the same ornament more than twice per site.
23. HERO ILLUSTRATION — for elegant events (weddings, anniversaries, engagements, quinces, formal galas), use the __HERO_AI__ placeholder with a HERO_AI_PROMPT comment so the server generates a custom watercolor hero. Always include an Unsplash fallback URL alongside it.
24. COVER-PAGE VARIETY — DO NOT always default to envelope+seal. Match the cover variant (A envelope, B pressed flower, C postcard, D telegram, E embossed velvet) to the event's mood and venue. Garden/spring → B. Destination → C. Anniversary/retirement → D. Black-tie/NYE → E. Default A only for classic formal weddings with no other signal.
25. REVEAL TRANSITION — every cover-to-body transition MUST be one of the animated reveals (envelope flap opens, seal cracks, paper unfolds, veil lifts). NO instant fade-only. The reveal is the most-watched moment.
26. PAPER TEXTURE — every cream card section MUST have a real paper texture (linen, kraft, marble, velvet, parchment, or SVG noise filter) applied via CSS / inline SVG data URI. No solid flat cream.
27. SECTION RECIPES — for at least 2 sections in the body, use a NAMED RECIPE (polaroid scatter, vinyl record, letterpress block, ticket stub, letter from parents, typewriter program, postcard stack, framed citation, program fold, pin-board cork) instead of the default cream card. Match recipe to section purpose and event mood.
28. SAVE-THE-DATE MODE — if the prompt says "save the date" / "save-the-date" / "STD" / "announce", or the event is more than 6 months out, use the SAVE-THE-DATE MODE layout (3-4 sections only, no RSVP form, big countdown, "Formal invitation to follow"). Don't pad with empty sections.
29. GUEST GREETING — for elegant events with couples (weddings, anniversaries, engagements, quinces), include ONE __GUEST_BLOCK__ placeholder ABOVE the couple names so guests opening their personalized /s/<slug>?g=<token> link see a hand-addressed welcome. Skip for casual events.
30. LIVE RSVP COUNTER — when an RSVP form is present, include the __RSVP_COUNT__ placeholder either above the form ("Join 82 others") or below it ("82 yes so far"). The server fills in the live count on render.
31. STICKER LAYER — for elegant events, scatter 3-5 CSS-only stickers (gold leaf, postage stamp, wax drip, drink ring, fingerprint) across the body for real-paper feel.
32. PHOTO FILTER — apply ONE cohesive CSS filter to every photo on the site (vintage warm / soft dreamy / moody editorial / boho film / crisp modern) so they feel curated.
33. PAPER STACK DEPTH — hero, RSVP, and Our Story cards get the 3-layer paper-stack ::before/::after effect.
34. CALLIGRAPHY NAMES — for elegant events, render the couple names on the hero as inline SVG path with stroke-dasharray draw-in animation triggered on cover reveal.
35. ANIMATED MOTIFS — candles flicker, eucalyptus sways, flowers bloom subtly on scroll into view. Subtle 1-3px / 1-3° movements only.
36. PARALLAX HERO — hero photo uses background-attachment: fixed (with mobile fallback) for cinematic depth.
37. MAGAZINE COVER — for sites using EDITORIAL or MODERN LUXURY font pairings, treat the hero as a magazine cover (masthead, issue line, cover bullets, vertical RSVP tag).
38. HOLIDAY ACCENTS — when the event date is within 14 days of a major holiday (Halloween, Thanksgiving, Christmas, NYE, Valentine's, 4th of July), add a subtle themed accent.
39. AMBIENT SOUND — elegant events MAY include a CSS-only ♫ audio toggle in the bottom-right with a royalty-free clip; off by default, only plays on click. Skip for casual events.

After </html>, return NOTHING.

Also, on the very first line of your reply, include a comment: <!-- TITLE: Your Chosen Title --> where the title is 3–6 words. Then on the next line start the <!DOCTYPE html>.`;
}

const EDIT_SUFFIX = `

=== EDIT MODE ===
The CURRENT site HTML follows. Apply the user's latest change request to it and return the FULL modified HTML document. Preserve sections the user didn't ask to change — only touch what they asked for. Same output rules: one HTML doc, no prose, no fences, start with the title comment then <!DOCTYPE html>.

CURRENT SITE HTML:
`;

function extractTitle(html: string): string {
  const commentMatch = html.match(/<!--\s*TITLE:\s*([^>-]+?)\s*-->/i);
  if (commentMatch) return commentMatch[1].trim().slice(0, 80);
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim().slice(0, 80);
  return "Untitled event";
}

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "site";
  const suffix = Math.random().toString(16).slice(2, 8);
  return `${base}-${suffix}`;
}

// Generate a custom watercolor hero illustration via OpenAI gpt-image-2
// (with gpt-image-1 fallback). Uploads to ai-site-images bucket and
// returns the public URL, or null on any failure (caller keeps the
// Unsplash fallback baked into the generated CSS).
async function generateHeroIllustration(
  prompt: string,
  slug: string,
  admin: ReturnType<typeof createClient>,
): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;
  const fullPrompt =
    "Watercolor illustration for an elegant event invitation hero. " +
    "Soft painterly style, hand-painted feel, atmospheric, no text or " +
    "letters anywhere in the image. Subject: " + prompt.slice(0, 800);

  async function call(model: string) {
    return await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: fullPrompt,
        n: 1,
        size: "1536x1024",
        quality: "medium",
      }),
    });
  }

  let res = await call("gpt-image-2");
  if (!res.ok) {
    const detail = await res.clone().text().catch(() => "");
    if (/model_not_found|invalid_model|does not exist/i.test(detail)) {
      res = await call("gpt-image-1");
    }
  }
  if (!res.ok) {
    console.warn("[ai-site-generate] hero illustration gen failed", res.status);
    return null;
  }
  const body = await res.json().catch(() => null) as any;
  const b64: string | undefined = body?.data?.[0]?.b64_json;
  if (!b64) return null;

  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const filename = `${slug}/hero-${crypto.randomUUID()}.png`;
  const { error: upErr } = await admin.storage
    .from("ai-site-images")
    .upload(filename, bytes, { contentType: "image/png", upsert: false });
  if (upErr) {
    console.warn("[ai-site-generate] hero upload failed", upErr);
    return null;
  }
  const { data } = admin.storage.from("ai-site-images").getPublicUrl(filename);
  return data?.publicUrl ?? null;
}

function stripCodeFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\n?/, "").replace(/```\s*$/, "");
  }
  // With tools enabled, Claude sometimes prefaces the doc with a sentence
  // ("Based on my search..."). Strip anything before the title comment or
  // <!DOCTYPE html> so the iframe gets a clean document.
  const titleIdx = t.search(/<!--\s*TITLE:/i);
  const docIdx = t.search(/<!doctype html/i);
  const startIdx =
    titleIdx >= 0 && (docIdx < 0 || titleIdx < docIdx) ? titleIdx : docIdx;
  if (startIdx > 0) t = t.slice(startIdx);
  return t.trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  const userPrompt = String(payload?.prompt ?? "").trim();
  if (!userPrompt) return jsonResponse(400, { error: "missing_prompt" });
  if (userPrompt.length > 4000) return jsonResponse(400, { error: "prompt_too_long" });
  const moderation = moderatePrompt(userPrompt);
  if (!moderation.ok) return jsonResponse(400, { error: moderation.reason });
  if (!ANTHROPIC_API_KEY) return jsonResponse(500, { error: "ANTHROPIC_API_KEY not set" });

  const editSiteId =
    typeof payload?.edit_site_id === "string" && payload.edit_site_id.length > 0
      ? payload.edit_site_id
      : null;

  // Resolve the signed-in user (if any) from the bearer header. We
  // only honor owner_user_id from the JWT — never trust a client-
  // provided field.
  let authedUserId: string | null = null;
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (bearer && bearer !== SUPABASE_ANON_KEY) {
    try {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data } = await userClient.auth.getUser();
      authedUserId = data?.user?.id ?? null;
    } catch {
      // anon — ignore
    }
  }

  const rawConv = Array.isArray(payload?.conversation) ? payload.conversation : [];
  const conversation = rawConv
    .filter(
      (m: any) =>
        m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
    )
    .slice(-10)
    .map((m: any) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content).slice(0, 8000),
    }));

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // For edit mode, load the current site and gate access.
  let currentSite: {
    id: string;
    slug: string;
    html: string;
    owner_user_id: string | null;
    edit_count: number;
  } | null = null;
  if (editSiteId) {
    const { data, error } = await admin
      .from("ai_sites")
      .select("id, slug, html, owner_user_id, edit_count")
      .eq("id", editSiteId)
      .maybeSingle();
    if (error || !data) {
      return jsonResponse(404, { error: "site_not_found" });
    }
    currentSite = data as any;
    // If the site has an owner, only the owner can edit. Anonymous
    // sites (owner_user_id IS NULL) are editable by anyone during
    // their builder session — slug isn't shared until they publish,
    // and the testing flow needs this.
    if (
      currentSite!.owner_user_id &&
      currentSite!.owner_user_id !== authedUserId
    ) {
      return jsonResponse(403, { error: "not_owner" });
    }
  }

  const rsvpEndpoint = `${SUPABASE_URL}/functions/v1/ai-site-rsvp-submit?slug=__SLUG__`;
  const todayIso = new Date().toISOString().slice(0, 10);
  const baseSystem = buildSystemPrompt(rsvpEndpoint, todayIso);
  const systemText = currentSite
    ? baseSystem + EDIT_SUFFIX + currentSite.html
    : baseSystem;

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      stream: true,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 3,
        },
      ],
      system: [
        {
          type: "text",
          text: systemText,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        ...conversation,
        { role: "user" as const, content: userPrompt },
      ],
    }),
  });

  if (!anthropicRes.ok || !anthropicRes.body) {
    const errText = await anthropicRes.text().catch(() => "");
    console.error("[ai-site-generate] anthropic error", anthropicRes.status, errText);
    return jsonResponse(502, { error: `anthropic_${anthropicRes.status}` });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      let fullText = "";
      try {
        const reader = anthropicRes.body!.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const events = buf.split("\n\n");
          buf = events.pop() ?? "";
          for (const evt of events) {
            for (const line of evt.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              const payloadStr = line.slice(6);
              try {
                const data = JSON.parse(payloadStr);
                if (
                  data?.type === "content_block_delta" &&
                  data?.delta?.type === "text_delta" &&
                  typeof data.delta.text === "string"
                ) {
                  fullText += data.delta.text;
                  send({ type: "chunk", text: data.delta.text });
                }
              } catch {
                // ignore non-JSON keepalive lines
              }
            }
          }
        }
      } catch (e) {
        console.error("[ai-site-generate] stream read error", e);
        send({ type: "error", message: "stream_failed" });
        controller.close();
        return;
      }

      let html = stripCodeFences(fullText);
      if (!html.toLowerCase().includes("<!doctype html")) {
        console.error("[ai-site-generate] non-html reply", html.slice(0, 200));
        send({ type: "error", message: "invalid_generation" });
        controller.close();
        return;
      }

      const title = extractTitle(html);
      const slug = currentSite ? currentSite.slug : slugify(title);
      // Short description for OG tags. Pull from <meta name="description">
      // if Claude included one; otherwise derive from title.
      const descMatch = html.match(
        /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i,
      );
      const ogDescription = descMatch
        ? descMatch[1].slice(0, 200)
        : `${title} — RSVP and event details.`;

      // Force-correct the slug in the RSVP form action. Claude often
      // ignores the __SLUG__ placeholder and invents a plausible slug
      // from the event title — that would cause RSVPs to 404 against
      // the real slug. We rewrite ANY slug= query param attached to
      // ai-site-rsvp-submit URLs to the actual slug for this site.
      html = html.replace(
        /(ai-site-rsvp-submit[^"' ]*?[?&]slug=)([^"'&\s]*)/g,
        (_m, prefix) => `${prefix}${slug}`,
      );
      // If Claude included the literal placeholder anywhere, fix it too.
      html = html.replaceAll("__SLUG__", slug);

      // Custom watercolor hero. If Claude emitted a HERO_AI_PROMPT
      // comment AND used the __HERO_AI__ placeholder URL, generate
      // the illustration via OpenAI and swap the placeholder. Best-
      // effort: if generation fails the Unsplash fallback that
      // Claude was instructed to bake in stays in place.
      const heroMatch = html.match(/<!--\s*HERO_AI_PROMPT:\s*([\s\S]*?)\s*-->/i);
      if (heroMatch && html.includes("__HERO_AI__")) {
        const heroPrompt = heroMatch[1].trim().slice(0, 800);
        try {
          const heroUrl = await generateHeroIllustration(heroPrompt, slug, admin);
          if (heroUrl) html = html.replaceAll("__HERO_AI__", heroUrl);
        } catch (e) {
          console.warn("[ai-site-generate] hero pipeline error", e);
        }
      }

      try {
        let savedSiteId: string;
        let newVersionNumber: number;
        if (currentSite) {
          newVersionNumber = (currentSite.edit_count ?? 0) + 2;
          const { error: updateErr } = await admin
            .from("ai_sites")
            .update({
              title,
              prompt: userPrompt,
              html,
              og_description: ogDescription,
              edit_count: (currentSite.edit_count ?? 0) + 1,
            })
            .eq("id", currentSite.id);
          if (updateErr) {
            console.error("[ai-site-generate] update error", updateErr);
            send({ type: "error", message: "save_failed" });
            controller.close();
            return;
          }
          savedSiteId = currentSite.id;
        } else {
          newVersionNumber = 1;
          const { data: inserted, error: insertErr } = await admin
            .from("ai_sites")
            .insert({
              slug,
              title,
              prompt: userPrompt,
              html,
              og_description: ogDescription,
              owner_user_id: authedUserId,
            })
            .select("id")
            .maybeSingle();
          if (insertErr || !inserted) {
            console.error("[ai-site-generate] insert error", insertErr);
            send({ type: "error", message: "save_failed" });
            controller.close();
            return;
          }
          savedSiteId = (inserted as { id: string }).id;
        }

        // Snapshot this state so the user can "undo" back to it.
        // Best-effort: a version-table failure shouldn't fail the
        // user's edit (they already see the result in the iframe).
        void admin
          .from("ai_site_versions")
          .insert({
            site_id: savedSiteId,
            version_number: newVersionNumber,
            html,
            title,
            prompt: userPrompt,
            og_description: ogDescription,
          })
          .then((r: { error: unknown }) => {
            if (r.error) {
              console.warn("[ai-site-generate] version snapshot failed", r.error);
            }
          });

        send({
          type: "done",
          slug,
          title,
          site_id: savedSiteId,
          version_number: newVersionNumber,
        });
      } catch (e) {
        console.error("[ai-site-generate] save exception", e);
        send({ type: "error", message: "save_failed" });
        controller.close();
        return;
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      ...cors,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
});
