// AUTO-GENERATED flat-lay engine. Source of truth: the hand-built Ava & Liam
// invite. composeFlatLay(spec) emits the flat-lay HTML; ai-site-render injects
// base CSS + GSAP + OG meta. Verified: composeFlatLay(DEFAULT_SPEC) reproduces
// the stored Ava & Liam HTML byte-for-byte.
//
// Stage 1: couple/event scalars. Stage 2 (in progress): structured content
// blocks -> spec arrays; bespoke SVGs live in ICONS keyed by name.

export interface ScheduleItem { iconKey: string; time: string; label: string }
export interface MenuItem { name: string; desc?: string }
export interface MenuGroup { iconKey: string; title: string; items: MenuItem[] }

export interface GalleryPhoto { src: string; name: string }
export interface StorySection { title?: string; body: string; photos: string[] }
export interface ProposalSection { body: string; proposalPhotos: string[]; engagementPhotos: string[] }
export interface Partner { photo: string; role: string; bio: string; ffLabel: string; ffacts: string[] }

export interface FlatLaySpec {
  slug: string;
  name1: string; name2: string; init1: string; init2: string;
  dateFull: string; dateLong: string; timeStart: string; timeEnd: string;
  venue: string; address: string; mapQuery: string; dressCode: string; signoffPre: string;
  schedule: ScheduleItem[];
  menus: MenuGroup[];
  swatches: string[];
  gallery: GalleryPhoto[];
  heroPhoto: string;
  heroIntro: string;
  story: { howMet: StorySection; firstDate: StorySection; proposal: ProposalSection };
  partners: Partner[];
  travel: AccItem[];
  faqs: AccItem[];
  mealOptions: string[];
  events: { label: string; checked: boolean }[];
}
export interface AccItem { iconKey: string; title: string; body: string }

export const ICONS: Record<string, string> = {
  "sch0": "<svg class=\"sicon\" viewBox=\"0 0 48 40\"><circle cx=\"20\" cy=\"25\" r=\"8.5\"/><circle cx=\"30\" cy=\"25\" r=\"8.5\"/><path d=\"M27 13l3-4 3 4-3 3z\"/></svg>",
  "sch1": "<svg class=\"sicon\" viewBox=\"0 0 40 40\"><path d=\"M9 9h22L20 23z\"/><line x1=\"20\" y1=\"23\" x2=\"20\" y2=\"32\"/><line x1=\"13\" y1=\"32\" x2=\"27\" y2=\"32\"/><line x1=\"26\" y1=\"11\" x2=\"30\" y2=\"6\"/><circle cx=\"30\" cy=\"6\" r=\"1.6\"/></svg>",
  "sch2": "<svg class=\"sicon\" viewBox=\"0 0 40 40\"><path d=\"M11 7v7M14 7v7M8 7v7\"/><path d=\"M11 14v19\"/><path d=\"M30 7c2.6 2 2.6 9 0 12v14\"/></svg>",
  "sch3": "<svg class=\"sicon\" viewBox=\"0 0 40 40\"><path d=\"M16 28V12l13-3v15\"/><circle cx=\"13\" cy=\"28\" r=\"3.2\"/><circle cx=\"26\" cy=\"25\" r=\"3.2\"/></svg>",
  "menu0": "<svg class=\"sicon\" viewBox=\"0 0 40 40\"><rect x=\"11\" y=\"7\" width=\"18\" height=\"26\" rx=\"2\"/><line x1=\"15\" y1=\"14\" x2=\"25\" y2=\"14\"/><line x1=\"15\" y1=\"19\" x2=\"25\" y2=\"19\"/><line x1=\"15\" y1=\"24\" x2=\"22\" y2=\"24\"/></svg>",
  "menu1": "<svg class=\"sicon\" viewBox=\"0 0 40 40\"><path d=\"M13 7h14c0 8-3 12-7 12s-7-4-7-12z\"/><line x1=\"20\" y1=\"19\" x2=\"20\" y2=\"31\"/><line x1=\"14\" y1=\"31\" x2=\"26\" y2=\"31\"/></svg>",
  "menu2": "<svg class=\"sicon\" viewBox=\"0 0 40 40\"><path d=\"M12 19h16l-2 13H14z\"/><path d=\"M12 19c0-6 4-9 8-9s8 3 8 9\"/><line x1=\"20\" y1=\"5\" x2=\"20\" y2=\"10\"/><circle cx=\"20\" cy=\"5\" r=\"1.6\"/></svg>",
  "trv0": "<svg class=\"sicon\" viewBox=\"0 0 40 40\"><rect x=\"11\" y=\"9\" width=\"18\" height=\"24\" rx=\"1.5\"/><line x1=\"15\" y1=\"14\" x2=\"17\" y2=\"14\"/><line x1=\"23\" y1=\"14\" x2=\"25\" y2=\"14\"/><line x1=\"15\" y1=\"19\" x2=\"17\" y2=\"19\"/><line x1=\"23\" y1=\"19\" x2=\"25\" y2=\"19\"/><line x1=\"15\" y1=\"24\" x2=\"17\" y2=\"24\"/><line x1=\"23\" y1=\"24\" x2=\"25\" y2=\"24\"/><path d=\"M17 33v-5h6v5\"/></svg>",
  "trv1": "<svg class=\"sicon\" viewBox=\"0 0 40 40\"><circle cx=\"16\" cy=\"17\" r=\"5.5\"/><path d=\"M20 21l9 9\"/><line x1=\"26\" y1=\"27\" x2=\"29\" y2=\"24\"/><line x1=\"29\" y1=\"30\" x2=\"32\" y2=\"27\"/></svg>",
  "trv2": "<svg class=\"sicon\" viewBox=\"0 0 40 40\"><rect x=\"10\" y=\"8\" width=\"20\" height=\"24\" rx=\"3\"/><path d=\"M17 26V14h4a3.5 3.5 0 0 1 0 7h-4\"/></svg>",
  "trv3": "<svg class=\"sicon\" viewBox=\"0 0 40 40\"><rect x=\"8\" y=\"12\" width=\"24\" height=\"14\" rx=\"2\"/><line x1=\"8\" y1=\"19\" x2=\"32\" y2=\"19\"/><line x1=\"20\" y1=\"12\" x2=\"20\" y2=\"19\"/><circle cx=\"14\" cy=\"29\" r=\"2.4\"/><circle cx=\"26\" cy=\"29\" r=\"2.4\"/></svg>",
  "faq0": "<svg class=\"sicon\" viewBox=\"0 0 40 40\"><circle cx=\"16\" cy=\"15\" r=\"4.5\"/><path d=\"M9 31c0-4.5 3.2-7.5 7-7.5s7 3 7 7.5\"/><circle cx=\"28\" cy=\"17\" r=\"3.4\"/><path d=\"M26 24c3 0 5 2.2 5 6\"/></svg>",
  "faq1": "<svg class=\"sicon\" viewBox=\"0 0 40 40\"><circle cx=\"20\" cy=\"13\" r=\"4\"/><path d=\"M20 17v9\"/><path d=\"M14 21h12\"/><path d=\"M16 32l4-6 4 6\"/></svg>",
  "faq2": "<svg class=\"sicon\" viewBox=\"0 0 40 40\"><rect x=\"10\" y=\"8\" width=\"20\" height=\"24\" rx=\"3\"/><path d=\"M17 26V14h4a3.5 3.5 0 0 1 0 7h-4\"/></svg>",
  "faq3": "<svg class=\"sicon\" viewBox=\"0 0 40 40\"><circle cx=\"20\" cy=\"20\" r=\"6\"/><line x1=\"20\" y1=\"6\" x2=\"20\" y2=\"10\"/><line x1=\"20\" y1=\"30\" x2=\"20\" y2=\"34\"/><line x1=\"6\" y1=\"20\" x2=\"10\" y2=\"20\"/><line x1=\"30\" y1=\"20\" x2=\"34\" y2=\"20\"/><line x1=\"10.2\" y1=\"10.2\" x2=\"13\" y2=\"13\"/><line x1=\"27\" y1=\"27\" x2=\"29.8\" y2=\"29.8\"/><line x1=\"29.8\" y1=\"10.2\" x2=\"27\" y2=\"13\"/><line x1=\"13\" y1=\"27\" x2=\"10.2\" y2=\"29.8\"/></svg>",
  "faq4": "<svg class=\"sicon\" viewBox=\"0 0 40 40\"><path d=\"M10 12h20v14H22l-5 5v-5h-7z\"/><path d=\"M17 17.6a3 3 0 1 1 4 2.8c-.9.5-1 .9-1 1.7\"/><circle cx=\"20\" cy=\"24.6\" r=\".7\"/></svg>"
};

export const DEFAULT_SPEC: FlatLaySpec = {
  slug: "ava-liam-leaf-preview",
  name1: "Ava", name2: "Liam", init1: "A", init2: "L",
  dateFull: "Saturday, October 11, 2026",
  dateLong: "October 11, 2026",
  timeStart: "4:00 in the afternoon",
  timeEnd: "10:00 in the evening",
  venue: "Maple Grove Estate",
  address: "1842 Maple Grove Lane,<br>Hudson, NY 12534",
  mapQuery: "Maple+Grove+Estate+Hudson+NY",
  dressCode: "Garden Formal",
  signoffPre: "With all our love,",
  schedule: [
  {
    "iconKey": "sch0",
    "time": "4:00 PM",
    "label": "Ceremony"
  },
  {
    "iconKey": "sch1",
    "time": "5:00 PM",
    "label": "Cocktail Hour"
  },
  {
    "iconKey": "sch2",
    "time": "6:00 PM",
    "label": "Reception"
  },
  {
    "iconKey": "sch3",
    "time": "9:00 PM",
    "label": "Special Activities"
  }
],
  menus: [
  {
    "iconKey": "menu0",
    "title": "Menu",
    "items": [
      {
        "name": "Heirloom Tomato &amp; Burrata",
        "desc": "basil · aged balsamic"
      },
      {
        "name": "Herb-Roasted Chicken",
        "desc": "lemon · thyme jus"
      },
      {
        "name": "Pan-Seared Salmon",
        "desc": "dill butter"
      },
      {
        "name": "Wild Mushroom Risotto",
        "desc": "vegetarian"
      },
      {
        "name": "Truffle Mashed Potatoes &amp; Greens"
      }
    ]
  },
  {
    "iconKey": "menu1",
    "title": "Bar Menu",
    "items": [
      {
        "name": "The Ava",
        "desc": "gin · elderflower · citrus"
      },
      {
        "name": "The Liam",
        "desc": "bourbon · maple · bitters"
      },
      {
        "name": "House Wine",
        "desc": "cabernet · chardonnay · ros&eacute;"
      },
      {
        "name": "Champagne Toast"
      },
      {
        "name": "Beer &amp; Non-Alcoholic",
        "desc": "on request"
      }
    ]
  },
  {
    "iconKey": "menu2",
    "title": "Dessert Menu",
    "items": [
      {
        "name": "Vanilla &amp; Raspberry Wedding Cake"
      },
      {
        "name": "Lemon Tartlets"
      },
      {
        "name": "Chocolate Truffles"
      },
      {
        "name": "French Macarons"
      },
      {
        "name": "Coffee &amp; Tea Bar"
      }
    ]
  }
],
  swatches: [
  "#2f3d24",
  "#5e7548",
  "#9caa85",
  "#c7a85e",
  "#d9c4a0",
  "#f2ead6"
],
  gallery: [
  {
    "src": "https://images.unsplash.com/photo-1519741497674-611481863552?w=700&q=80&auto=format,compress&fit=crop",
    "name": "ava-and-liam.jpg"
  },
  {
    "src": "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=700&q=80&auto=format,compress&fit=crop",
    "name": "reception.jpg"
  },
  {
    "src": "https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=700&q=80&auto=format,compress&fit=crop",
    "name": "ceremony.jpg"
  },
  {
    "src": "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=700&q=80&auto=format,compress&fit=crop",
    "name": "toast.jpg"
  },
  {
    "src": "https://images.unsplash.com/photo-1469371670807-013ccf25f16a?w=700&q=80&auto=format,compress&fit=crop",
    "name": "the-rings.jpg"
  },
  {
    "src": "https://images.unsplash.com/photo-1522413452208-996ff3f3e740?w=700&q=80&auto=format,compress&fit=crop",
    "name": "celebration.jpg"
  }
],
  heroPhoto: "https://images.unsplash.com/photo-1519741497674-611481863552?w=720&amp;q=80&amp;auto=format,compress&amp;fit=crop",
  heroIntro: "Two readers, one last copy, and a love story still being written. We&rsquo;d be honored to have you share the day with us.",
  story: {
  "howMet": {
    "title": "The Last Copy",
    "body": "It was a rainy Tuesday in a little corner bookshop. Ava and Liam both reached for the last copy of the same novel &mdash; and neither would let go. They settled it over coffee next door, and talked until the shop closed.",
    "photos": [
      "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=520&amp;q=80&amp;auto=format,compress&amp;fit=crop",
      "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=520&amp;q=80&amp;auto=format,compress&amp;fit=crop"
    ]
  },
  "firstDate": {
    "body": "A stroll through the autumn market that was only meant to last an hour. Five hours, two coffees, and one shared cinnamon roll later, they knew this was something rare.",
    "photos": [
      "https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=520&amp;q=80&amp;auto=format,compress&amp;fit=crop",
      "https://images.unsplash.com/photo-1522413452208-996ff3f3e740?w=520&amp;q=80&amp;auto=format,compress&amp;fit=crop"
    ]
  },
  "proposal": {
    "body": "On their anniversary, Liam brought Ava back to that same bookshop. Tucked inside her favorite novel was a hand-written note &mdash; and when she turned around, he was down on one knee.",
    "proposalPhotos": [
      "https://images.unsplash.com/photo-1469371670807-013ccf25f16a?w=520&amp;q=80&amp;auto=format,compress&amp;fit=crop",
      "https://images.unsplash.com/photo-1519741497674-611481863552?w=520&amp;q=80&amp;auto=format,compress&amp;fit=crop"
    ],
    "engagementPhotos": [
      "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=520&amp;q=80&amp;auto=format,compress&amp;fit=crop",
      "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=520&amp;q=80&amp;auto=format,compress&amp;fit=crop"
    ]
  }
},
  partners: [
  {
    "photo": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300&amp;q=80&amp;auto=format,compress&amp;fit=crop&amp;crop=faces",
    "role": "Partner One",
    "bio": "A book editor with a weakness for rainy days, slow mornings, and anything with cinnamon. She collects old novels and even older love songs.",
    "ffLabel": "Fun Facts",
    "ffacts": [
      "Has read Pride &amp; Prejudice twelve times",
      "Makes a legendary apple pie",
      "Named a houseplant after Liam"
    ]
  },
  {
    "photo": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&amp;q=80&amp;auto=format,compress&amp;fit=crop&amp;crop=faces",
    "role": "Partner Two",
    "bio": "An architect who sketches on napkins and never says no to an adventure. He makes the best pancakes and the worst puns.",
    "ffLabel": "Fun Fact",
    "ffacts": [
      "Can fold a paper crane in under a minute"
    ]
  }
],
  travel: [
  {
    "iconKey": "trv0",
    "title": "Hotel Recommendations",
    "body": "<div class=\"mline\"><span class=\"mname\">The Maple Inn</span><span class=\"mdesc\">boutique &middot; 5 min from venue</span></div><div class=\"mline\"><span class=\"mname\">Hudson Riverside Hotel</span><span class=\"mdesc\">riverfront &middot; 12 min from venue</span></div><div class=\"mline\"><span class=\"mname\">Grove Country Lodge</span><span class=\"mdesc\">cozy &amp; rustic &middot; 8 min from venue</span></div><a class=\"eimap\" href=\"https://www.google.com/maps/search/?api=1&amp;query=hotels+near+Maple+Grove+Estate+Hudson+NY\" target=\"_blank\" rel=\"noopener\">See hotels on the map</a>"
  },
  {
    "iconKey": "trv1",
    "title": "Room Block",
    "body": "<div class=\"eirow\"><span class=\"eik\">Hotel</span><span class=\"eiv\">The Maple Inn</span></div><div class=\"eirow\"><span class=\"eik\">Group Code</span><span class=\"eiv\">AVA &amp; LIAM 2026</span></div><div class=\"eirow\"><span class=\"eik\">Group Rate</span><span class=\"eiv\">$189 per night</span></div><div class=\"eirow\"><span class=\"eik\">Reserve By</span><span class=\"eiv\">September 10, 2026</span></div><a class=\"eimap\" href=\"https://www.google.com/maps/search/?api=1&amp;query=The+Maple+Inn+Hudson+NY\" target=\"_blank\" rel=\"noopener\">Book in the room block</a>"
  },
  {
    "iconKey": "trv2",
    "title": "Parking",
    "body": "<div class=\"mline\"><span class=\"mname\">Complimentary on-site parking</span><span class=\"mdesc\">valet from 3:30 PM</span></div><div class=\"mline\"><span class=\"mname\">Self-parking by the carriage house</span></div><div class=\"mline\"><span class=\"mname\">Leave your car overnight</span><span class=\"mdesc\">if you ride the shuttle home</span></div>"
  },
  {
    "iconKey": "trv3",
    "title": "Shuttle",
    "body": "<div class=\"mline\"><span class=\"mname\">The Maple Inn &rarr; Maple Grove Estate</span><span class=\"mdesc\">departs 3:15 PM</span></div><div class=\"mline\"><span class=\"mname\">Return trips to the hotel</span><span class=\"mdesc\">9:30 &middot; 10:15 &middot; 11:00 PM</span></div><div class=\"mline\"><span class=\"mname\">Look for the white estate van</span><span class=\"mdesc\">at the hotel lobby doors</span></div>"
  }
],
  faqs: [
  {
    "iconKey": "faq0",
    "title": "Plus-One Policy",
    "body": "<p class=\"faq-a\">Your invitation is reserved for the guests named when you RSVP. If a plus-one is included for you, the option will appear as you respond. Have a question about your party? Just reach out &mdash; we&rsquo;re happy to help.</p>"
  },
  {
    "iconKey": "faq1",
    "title": "Children Policy",
    "body": "<p class=\"faq-a\">We adore your little ones, but we&rsquo;ve planned an adults-only celebration so everyone can relax and dance the night away. Immediate family are, of course, the exception. Thank you for understanding!</p>"
  },
  {
    "iconKey": "faq2",
    "title": "Parking Instructions",
    "body": "<p class=\"faq-a\">Enter through the main gate off Maple Grove Lane &mdash; attendants will wave you in and take your keys at the valet stand. Self-parking is just past the carriage house. Please arrive by 3:40 PM so you&rsquo;re seated before the ceremony.</p>"
  },
  {
    "iconKey": "faq3",
    "title": "Weather Expectations",
    "body": "<p class=\"faq-a\">Mid-October in Hudson is crisp and golden &mdash; expect highs near 60&deg;F and cool evenings around 45&deg;F. The ceremony is outdoors on the lawn, so a wrap or light coat is a lovely idea. We&rsquo;ll have heaters and cozy blankets on hand, too.</p>"
  },
  {
    "iconKey": "faq4",
    "title": "More Questions",
    "body": "<p class=\"faq-a\"><strong>When should I arrive?</strong><br>Doors open at 3:30 PM. Please be seated by 3:50 &mdash; the ceremony begins promptly at 4:00.</p><p class=\"faq-a\"><strong>What should I wear?</strong><br>Garden formal in soft, natural tones. The ceremony is on grass, so block heels are your friend.</p><p class=\"faq-a\"><strong>Can I take photos?</strong><br>We&rsquo;re having an unplugged ceremony &mdash; please keep phones tucked away until after the vows, then snap away and add them to our Photo Gallery!</p><p class=\"faq-a\"><strong>Who do I contact?</strong><br>Reach our coordinator, Sophie, at (555)&nbsp;123-4567, or message Ava &amp; Liam directly.</p>"
  }
],
  mealOptions: [
  "Herb-Roasted Chicken",
  "Pan-Seared Salmon",
  "Wild Mushroom Risotto &middot; V",
  "Children&rsquo;s Meal"
],
  events: [
  {
    "label": "Ceremony",
    "checked": true
  },
  {
    "label": "Reception",
    "checked": true
  },
  {
    "label": "Welcome Party",
    "checked": false
  },
  {
    "label": "Rehearsal Dinner",
    "checked": false
  },
  {
    "label": "Brunch",
    "checked": false
  }
],
};

const TEMPLATE = `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no,viewport-fit=cover">
<title>{{NAME1}} & {{NAME2}}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Great+Vibes&family=Inter:wght@400;500&display=swap" rel="stylesheet">

<style>
*{box-sizing:border-box;margin:0;padding:0}
html{min-height:100%;background:#37412e;scroll-behavior:smooth}
body{min-height:100%;overflow-x:hidden;font-family:'Inter',sans-serif;color:#3a2f1c;background:transparent;-webkit-overflow-scrolling:touch}
body::before{content:'';position:fixed;inset:0;z-index:-2;pointer-events:none;background:#37412e url("https://pahpjjubhbcbwqjpamwv.supabase.co/storage/v1/object/public/ai-site-images/previews/linen-bg-v16.jpg") center center / cover;transform:translateZ(0);will-change:transform;backface-visibility:hidden}
body::after{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;background:linear-gradient(180deg,rgba(238,231,213,.92) 0%,rgba(238,231,213,.66) 22%,rgba(238,231,213,.28) 40%,rgba(238,231,213,0) 56%)}
.leaf-field{position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden}
.leaf-field img{position:absolute;top:-60px;will-change:transform;animation:lfall var(--d) linear infinite;animation-delay:var(--delay);opacity:.85}
@keyframes lfall{0%{transform:translateY(-60px) rotate(0)}50%{transform:translateY(50vh) translateX(var(--drift)) rotate(calc(var(--spin)*.5))}100%{transform:translateY(114vh) rotate(var(--spin))}}
.wrap{position:relative;z-index:1;max-width:760px;margin:0 auto;padding:0 5%}
.hero{min-height:33vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:4vh 0 1vh}
.eyebrow{font-size:11px;letter-spacing:.34em;text-transform:uppercase;opacity:.6;margin-bottom:1.4rem}
.names{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:clamp(2.8rem,8vw,4.8rem);line-height:1}
.names .amp{color:#b08d3c;font-style:italic;margin:0 .12em}
.venue{font-size:12px;letter-spacing:.28em;text-transform:uppercase;opacity:.7;margin-top:1rem}.invite{font-family:'Cormorant Garamond',serif;font-style:italic;font-weight:500;font-size:clamp(1.15rem,3.6vw,1.6rem);color:#5a4a28;opacity:.92;margin-top:.7rem}
.cd{display:flex;gap:1rem;margin-top:2.4rem}
.cd .cell{padding:.7rem 1.15rem;border:1px solid rgba(120,90,40,.35);border-radius:10px;background:rgba(0,0,0,.04);text-align:center;min-width:80px}
.cd .num{font-family:'Cormorant Garamond',serif;font-size:1.35rem;color:#7a5a1e}
.cd .lbl{font-size:9px;letter-spacing:.2em;text-transform:uppercase;opacity:.6;margin-top:.25rem}
.cards{position:relative;padding:2vh 0 14vh;display:flex;flex-direction:column;align-items:center;gap:4vh}
/* every card: SAME fixed size + 2:3 portrait so heights match */
.card{}
.c-details{filter:drop-shadow(3px 5px 5px rgba(20,26,16,.32))}
.c-photo{width:108px;aspect-ratio:1/1.2;background:#fff;padding:9px 9px 30px;border-radius:3px;box-shadow:3px 4px 4px rgba(20,26,16,.30),18px 23px 26px rgba(20,26,16,.42)}  /* picture: white Polaroid, thicker bottom lip */
.c-photo img{width:100%;height:100%;object-fit:cover;display:block;border-radius:1px}.p2{position:absolute;left:-60%;top:-34%;transform:rotate(-11deg);z-index:-1;margin:0}.wt{position:absolute;z-index:-3;pointer-events:none;transform:translate(-50%,-50%);filter:drop-shadow(3px 6px 8px rgba(20,26,12,.38))}.wtA{width:27%;left:17%;top:18%}.wtG{width:28%;left:11%;top:33%}.wtB{width:40%;left:11%;top:50%}.wtC{width:30%;left:18%;top:76%}.wtS{width:28%;left:25%;top:90%}.wtUL{width:42%;left:39%;top:-4%;z-index:-1}.c-details.t-left{transform:translateY(-50px) rotate(-4deg)}@media(max-width:4000px),(orientation:landscape) and (max-height:600px) and (pointer:coarse){.wtUL{width:52%;left:46%;top:2%}.ringbox{width:17%;left:80%;top:12%}.wtA{width:27%;left:13%;top:16%}.wtG{width:28%;left:11%;top:32%}.wtB{width:37%;left:11%;top:50%}.wtC{width:31%;left:14%;top:74%}.wtS{width:29%;left:21%;top:88%}}
.c-details{width:184px;aspect-ratio:1/1.42}     /* details: scalloped doily */
.c-rsvp{width:300px;aspect-ratio:1/1.2}        /* rsvp: medium, almost square */
img.card{display:block;object-fit:cover;border-radius:2px}
.post{box-shadow:3px 4px 4px rgba(20,26,16,.30),18px 23px 26px rgba(20,26,16,.42);background:#fffdf8;border:19px solid transparent;
  border-image:url('https://eventvendora.com/frames/garden-botanical.png') 150 fill / 19px / 0 stretch;
  display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:2px 9px}

.c-details{padding:11% 11% 12%;background:#fffdf8;box-shadow:3px 4px 4px rgba(20,26,16,.30),18px 23px 26px rgba(20,26,16,.42);border:0;border-radius:2px;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.mono{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:1.22rem;color:#3a2f1c;line-height:1}.mono .amp{color:#b08d3c;font-style:italic;margin:0 .08em}.drow{padding:.18rem 0}.dk{font-size:.42rem;letter-spacing:.22em;text-transform:uppercase;color:#9a7b3a;margin-bottom:.08rem}.dv{font-family:'Cormorant Garamond',serif;font-size:.72rem;color:#3a2f1c;line-height:1.2}
.oval{width:100%;height:100%;background:url('https://pahpjjubhbcbwqjpamwv.supabase.co/storage/v1/object/public/ai-site-images/previews/lace-square-v5.png') center center / contain no-repeat;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24% 24%;cursor:pointer}
.oval .sub{font-size:8px;letter-spacing:.24em;text-transform:uppercase;color:#9a7b3a}
.oval h2{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:1.3rem;color:#3a2f1c;margin:.08rem 0}
.flipd{position:absolute;opacity:0;width:0;height:0;pointer-events:none}
.tap{margin-top:.55rem;font-size:.5rem;letter-spacing:.2em;text-transform:uppercase;color:#5e7548;border:1px solid rgba(94,117,72,.55);border-radius:999px;padding:.38rem 1rem}
/* details popup */
.modal-wrap{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;opacity:0;visibility:hidden;transition:opacity .3s ease}
.modal-bg{position:absolute;inset:0;background:rgba(38,26,12,.5);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);cursor:pointer}
.modal-card{position:relative;z-index:1;width:min(84vw,330px);background:#fdf8ef url('https://pahpjjubhbcbwqjpamwv.supabase.co/storage/v1/object/public/ai-site-images/previews/paper-tex-v1.jpg') center center / cover;border-radius:20px;box-shadow:0 34px 80px rgba(28,18,6,.55),inset 0 0 0 1px rgba(176,138,79,.4),inset 0 0 0 5px #fffdf8,inset 0 0 0 6px rgba(176,138,79,.28);padding:30px 26px 26px;text-align:center;transform:scale(.85) translateY(12px);transition:transform .38s cubic-bezier(.2,.9,.25,1)}
.flipd:checked ~ .modal-wrap{opacity:1;visibility:visible}
.flipd:checked ~ .modal-wrap .modal-card{transform:none}
.modal-x{position:absolute;top:6px;right:16px;font-size:1.4rem;line-height:1;color:#9a7b3a;cursor:pointer}
.modal-card .sub{font-size:9px;letter-spacing:.3em;text-transform:uppercase;color:#9a7b3a}
.modal-card h2{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:1.8rem;color:#7a1f2b;margin:.1rem 0 .2rem}
.modal-card .row{padding:.5rem 0}
.modal-card .row:last-of-type{border-bottom:0}
.modal-card .row .k{font-size:.6rem;margin-bottom:.18rem}
.modal-card .row .v{font-size:1rem}


.post .sub{font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:#9a7b3a}
.post h2{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:1.4rem;color:#3a2f1c;margin:.08rem 0 .08rem}
.rule{display:block;margin:.15rem auto .35rem;color:#b08d3c}

.row{display:flex;flex-direction:column;align-items:center;padding:.26rem 0;border-bottom:1px solid rgba(120,90,40,.16);width:100%}
.row:last-child{border-bottom:0}
.row .k{color:#9a7b3a;letter-spacing:.1em;text-transform:uppercase;font-size:.52rem;margin-bottom:.06rem}
.row .v{font-size:.8rem;text-align:center;line-height:1.25}
.field{width:100%;margin:.28rem 0 0}
.field label{display:block;font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:#9a7b3a;margin-bottom:.22rem;text-align:left}

.field .line{height:30px;border:1px solid rgba(120,90,40,.3);border-radius:6px;background:#fff}
.opts{display:flex;gap:.35rem;width:100%;margin:.32rem 0}
.opt{flex:1;border:1px solid rgba(120,90,40,.4);border-radius:6px;padding:.5rem .3rem;font-size:.66rem;text-align:center;line-height:1.2}
.opt.on{background:#5e7548;color:#fff;border-color:#5e7548}
.btn{margin:.55rem auto 0;display:block;width:fit-content;background:#5e7548;color:#fff;border-radius:999px;padding:.55rem 1.6rem;font-size:.66rem;letter-spacing:.16em;text-transform:uppercase}
.t-left{transform:rotate(-5deg)}
.t-right{transform:rotate(4.5deg)}.cw.sr{position:static;height:228px}.pL{position:absolute;z-index:-1;left:-3%;top:70%;transform:rotate(-25deg)}.pR{position:absolute;z-index:2;left:54%;top:11%;transform:rotate(14deg)}
.t-left2{transform:rotate(-2deg)}
.sl{align-self:flex-start;margin-left:0}
.sr{align-self:flex-end;margin-right:1%}
.sl2{align-self:flex-start;margin-left:26%}
.cw{position:relative}.ringbox{position:absolute;z-index:-1;pointer-events:none;width:16%;left:78%;top:1%;transform:rotate(8deg) scaleX(-1);filter:drop-shadow(2px 5px 5px rgba(20,26,12,.4)) drop-shadow(0 14px 16px rgba(20,26,12,.32))}.tray{position:absolute;z-index:-2;pointer-events:none;width:84%;left:50%;top:48%;transform:translate(-50%,-50%) rotate(0deg);filter:drop-shadow(4px 12px 16px rgba(20,26,12,.4))}@media(max-width:4000px),(orientation:landscape) and (max-height:600px) and (pointer:coarse){.tray{width:98%}}.bloom{position:absolute;z-index:-1;pointer-events:none;height:auto;filter:drop-shadow(5px 9px 13px rgba(20,26,12,.5))}
.b1{width:132%;left:-66%;top:50%;transform:translateY(-50%)}
.b2{width:132%;left:34%;top:50%;transform:translateY(-50%)}
@media(max-width:4000px),(orientation:landscape) and (max-height:600px) and (pointer:coarse){.c-photo{width:30vw;max-width:115px}.c-details{width:45vw;max-width:158px}.c-rsvp{width:56vw;max-width:235px}.cards{gap:5vh}.names{font-size:clamp(2.4rem,11vw,3.6rem)}.sl{margin-left:0}.sr{margin-right:0}.sl2{margin-left:20%}}
.countdown{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:1.1rem;padding:7vh 0 13vh}
.countdown .ct{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:1.5rem;color:#f3ecda;text-shadow:0 1px 6px rgba(0,0,0,.35)}
.cd-foot{display:flex;gap:1rem}
.cd-foot .cell{padding:.85rem 1.35rem;border:1px solid rgba(243,236,218,.5);border-radius:10px;background:rgba(243,236,218,.12);text-align:center;min-width:84px}
.cd-foot .num{font-family:'Cormorant Garamond',serif;font-size:1.65rem;color:#f6efdd}
.cd-foot .lbl{font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:rgba(243,236,218,.78);margin-top:.3rem}
</style><style>@media(max-width:4000px),(orientation:landscape) and (max-height:600px) and (pointer:coarse){.cards .ringbox{width:18%;left:79%;top:1.5%}.cards .c-details.t-left{transform:translateY(25px) rotate(-4deg)}}</style><style>.cw.sl2{position:static;height:470px}.c-rsvp{position:absolute;left:3%;top:75%;transform:scale(.63) rotate(-2deg);transform-origin:top left;z-index:3}@media(max-width:4000px),(orientation:landscape) and (max-height:600px) and (pointer:coarse){.cards .cw.sl2{height:215px}.cards .c-rsvp{left:4%;top:73%;transform:scale(.66) rotate(-2deg);transform-origin:top left}.cards .pL{top:62%;left:1.5%}.cards .pR{top:18.5%;left:57%}}</style><style>.lace-card{position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);width:80%;aspect-ratio:5/7;background:url(https://pahpjjubhbcbwqjpamwv.supabase.co/storage/v1/object/public/ai-site-images/previews/lace-doily-v1.png) center center/100% 100% no-repeat;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;z-index:1;cursor:pointer;padding:0 15%}.lace-card .l1{font-family:'Cormorant Garamond',serif;font-weight:500;font-size:clamp(.95rem,2.6vw,1.3rem);color:#5a4a28;line-height:1.3;letter-spacing:.01em}.lace-card .l2{font-family:'Great Vibes',cursive;font-size:clamp(2.6rem,7.4vw,3.8rem);color:#b08d3c;line-height:1;margin-top:.1rem}.c-photo.pL{width:86px}@media(max-width:4000px),(orientation:landscape) and (max-height:600px) and (pointer:coarse){.c-photo.pL{width:23vw;max-width:90px}}</style><style>.c-rsvp{background:#fffdf8;border:0;border-image:none;border-radius:0 100% 0 0/0 55% 0 0;justify-content:flex-end;padding:20% 24px 26px;box-shadow:3px 5px 7px rgba(20,26,16,.3),14px 20px 26px rgba(20,26,16,.4)}.c-rsvp::before{content:"";position:absolute;inset:11px;border:1px solid #b08d3c;border-radius:0 100% 0 0/0 50% 0 0;pointer-events:none}.story-card{position:absolute;width:300px;aspect-ratio:1/1.2;left:56%;top:67%;z-index:-1;background:#fffdf8;border-radius:48% 48% 0 0/24% 24% 0 0;box-shadow:3px 5px 7px rgba(20,26,16,.3),14px 20px 26px rgba(20,26,16,.4);display:flex;flex-direction:column;align-items:center;text-align:center;padding:30% 14% 26px;transform:scale(.63) rotate(2deg);transform-origin:top left}.story-card::before{content:"";position:absolute;inset:11px;border:1px solid #b08d3c;border-radius:46% 46% 0 0/21% 21% 0 0;pointer-events:none}.story-card .st-sub{font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:#9a7b3a}.story-card .st-title{font-family:'Great Vibes',cursive;font-size:2.6rem;color:#b08d3c;line-height:1;margin:.1rem 0 .5rem}.story-card .st-p{font-family:'Cormorant Garamond',serif;font-size:1.15rem;color:#3a2f1c;line-height:1.4}@media(max-width:4000px),(orientation:landscape) and (max-height:600px) and (pointer:coarse){.cards .cw.sl2{height:440px}.cards .story-card{left:47%;top:65%}.cards .euc-a{width:30%;left:47%;top:-4%;transform:rotate(25deg)}.cards .euc-b{width:24%;left:-12%;top:25%;transform:rotate(10deg) scaleX(-1)}.cards .euc-c{width:24%;left:78%;top:49%;transform:rotate(150deg)}}</style><style>.c-details::before{content:"";position:absolute;inset:9px;border:1px solid #b08d3c;pointer-events:none}.story-card{background:#5d6e48}.story-card::before{border-color:#d8c079}.story-card .st-sub{color:#e7e0cb}.story-card .st-title{color:#ecd29a}.story-card .st-p{color:#f1ecdc}</style><style>.envelope{position:absolute;z-index:-3;pointer-events:none;width:62%;left:25%;top:15%;transform:translateY(-50%) rotate(7deg);filter:drop-shadow(3px 6px 8px rgba(20,26,12,.4))}@media(max-width:4000px),(orientation:landscape) and (max-height:600px) and (pointer:coarse){.envelope{width:70%;left:30%;top:23%}}</style><style>.euc{position:absolute;z-index:-4;pointer-events:none;filter:drop-shadow(1px 5px 12px rgba(20,26,12,.44)) drop-shadow(0 2px 4px rgba(20,26,12,.30))}.euc-a{width:24%;left:50%;top:-5%;transform:rotate(22deg)}.euc-b{width:19%;left:-9%;top:23%;transform:rotate(10deg) scaleX(-1)}.euc-c{width:19%;left:77%;top:47%;transform:rotate(150deg)}</style><style>.story-card{background:#ffffff}.story-card::before{border-color:#b08d3c}.story-card .st-sub{color:#9a7b3a}.story-card .st-title{color:#b08d3c}.story-card .st-p{color:#3a2f1c}.c-rsvp{background:#5d6e48}.c-rsvp::before{border-color:#d8c079}.c-rsvp .sub{color:#e7e0cb}.c-rsvp h2{color:#ecd29a}.c-rsvp .rule{color:#d8c079}.c-rsvp .field label{color:#e7e0cb}.c-rsvp .field .line{background:#fffdf8;border-color:rgba(216,192,121,.5)}.c-rsvp .opt{border-color:rgba(216,192,121,.6);color:#f1ecdc}.c-rsvp .opt.on{background:#ecd29a;color:#3a2f1c;border-color:#ecd29a}.c-rsvp .btn{background:#ecd29a;color:#3a2f1c}</style><style>.seal{position:absolute;z-index:3;pointer-events:none;width:13%;left:70%;top:92%;transform:translate(-50%,-50%) rotate(-6deg);filter:drop-shadow(2px 6px 7px rgba(20,26,12,.5)) drop-shadow(0 2px 3px rgba(20,26,12,.4))}@media(max-width:4000px),(orientation:landscape) and (max-height:600px) and (pointer:coarse){.cards .seal{width:17%;left:72%;top:91%}}</style><style>.signoff{position:relative;z-index:1;text-align:center;padding:2vh 0 1vh}.signoff .so-pre{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:1.4rem;color:#ece1c6;letter-spacing:.02em}.signoff .so-sig{font-family:'Great Vibes',cursive;font-size:3.6rem;line-height:1.1;color:#e7cf96;margin-top:.25rem;text-shadow:0 1px 7px rgba(0,0,0,.4)}@media(max-width:4000px),(orientation:landscape) and (max-height:600px) and (pointer:coarse){.signoff .so-sig{font-size:2.9rem}.signoff .so-pre{font-size:1.2rem}}</style><style>.c-photo,.c-details,.post,.c-rsvp,.story-card{box-shadow:0 6px 20px rgba(20,26,16,.30),3px 5px 8px rgba(20,26,16,.32),16px 22px 30px rgba(20,26,16,.42)}.lace-card{filter:drop-shadow(0 8px 18px rgba(20,26,12,.34))}</style><style>/* flip cards */.flip{position:absolute}.flip .fin{position:relative;width:100%;height:100%;transform-style:preserve-3d;-webkit-transform-style:preserve-3d;transition:transform .75s cubic-bezier(.2,.8,.25,1)}.flip .face{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;margin:0!important;z-index:auto!important;transform:none;transform-origin:50% 50%!important;backface-visibility:hidden;-webkit-backface-visibility:hidden}.flip .face.bk{transform:rotateY(180deg)}.flip .face.ff{cursor:pointer}.flip .fx{position:absolute;top:5px;right:13px;z-index:6;font-size:1.45rem;line-height:1;cursor:pointer;color:#9a7b3a}.lace-flip{left:50%;top:48%;transform:translate(-50%,-50%);width:80%;aspect-ratio:5/7;z-index:1;cursor:pointer;perspective:1700px}.story-flip{left:56%;top:67%;width:300px;aspect-ratio:1/1.2;z-index:2;transform:scale(.63) rotate(2deg);transform-origin:top left;perspective:1700px}.rsvp-flip{left:3%;top:75%;width:300px;aspect-ratio:1/1.2;z-index:3;transform:scale(.63) rotate(-2deg);transform-origin:top left;perspective:1700px}#fld:checked ~ .wrap .lace-flip .fin{transform:rotateY(180deg)}#fst:checked ~ .wrap .story-flip .fin{transform:rotateY(180deg)}#frs:checked ~ .wrap .rsvp-flip .fin{transform:rotateY(180deg)}#fld:checked ~ .wrap .lace-flip{position:fixed;left:50%;top:50%;width:min(94vw,500px);height:min(94vh,760px);transform:translate(-50%,-50%);transform-origin:center;z-index:80}#fst:checked ~ .wrap .story-flip{position:fixed;left:50%;top:50%;width:min(94vw,480px);height:min(90vh,660px);transform:translate(-50%,-50%);transform-origin:center;z-index:80}#frs:checked ~ .wrap .rsvp-flip{position:fixed;left:50%;top:50%;width:min(94vw,480px);height:min(90vh,660px);transform:translate(-50%,-50%);transform-origin:center;z-index:80}.lace-card.bk{padding:15% 19%}.lace-flip .fx{color:#9a7b3a}.bl-sub{font-size:7.5px;letter-spacing:.24em;text-transform:uppercase;color:#9a7b3a}.bl-h{font-family:'Great Vibes',cursive;font-size:1.6rem;color:#b08d3c;line-height:1;margin:.02rem 0 .28rem}.brow{display:flex;flex-direction:column;align-items:center;padding:.1rem 0}.bk-k{font-size:6px;letter-spacing:.16em;text-transform:uppercase;color:#9a7b3a}.bk-v{font-family:'Cormorant Garamond',serif;font-size:.7rem;color:#3a2f1c;line-height:1.12}.story-flip .fx{color:#9a7b3a}.story-card.bk{justify-content:flex-start;padding:25% 14% 20px}.sb-p{font-family:'Cormorant Garamond',serif;font-size:.92rem;line-height:1.42;color:#3a2f1c;margin-top:.2rem}.rsvp-flip .fx{color:#e7e0cb}.rf-note{margin-top:.55rem;font-size:.62rem;letter-spacing:.2em;text-transform:uppercase;color:#e7e0cb}@media(max-width:4000px),(orientation:landscape) and (max-height:600px) and (pointer:coarse){.cards .story-flip{left:47%;top:65%}.cards .rsvp-flip{left:4%;top:73%;transform:scale(.66) rotate(-2deg);transform-origin:top left;width:56vw;max-width:235px}}</style><style>.flip-bg{position:fixed;inset:0;background:rgba(28,34,22,.5);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);opacity:0;visibility:hidden;transition:opacity .4s ease;z-index:70;cursor:pointer}.flip{transition:transform .5s cubic-bezier(.2,.8,.25,1)}#fld:checked ~ .wrap .lace-bg,#frs:checked ~ .wrap .rsvp-bg,#fst:checked ~ .wrap .story-bg{opacity:1;visibility:visible}</style><style>.flip .fx{font-size:2rem;top:8px;right:18px}.lace-card.bk{padding:12% 17%}.bl-sub{font-size:11px}.bl-h{font-size:2.5rem;margin:.05rem 0 .5rem}.brow{padding:.2rem 0}.bk-k{font-size:9px}.bk-v{font-size:1.1rem}.story-card.bk{padding:20% 12% 26px}.sb-p{font-size:1.2rem;line-height:1.55}.c-rsvp.bk{padding:17% 34px 32px}.c-rsvp.bk .field label{font-size:.92rem;margin-bottom:.4rem}.c-rsvp.bk .field .line{height:46px}.c-rsvp.bk .opts{gap:.6rem;margin:.6rem 0}.c-rsvp.bk .opt{font-size:1rem;padding:.85rem .5rem}.c-rsvp.bk .btn{font-size:1rem;padding:.85rem 2.4rem;margin-top:.9rem}.story-card.bk .st-title{font-size:3.4rem}</style><style>.flip .face.bk{overflow-y:auto;-webkit-overflow-scrolling:touch}.c-rsvp.bk{justify-content:center}.cx{position:fixed;top:12px;right:20px;z-index:95;font-size:2.6rem;line-height:1;color:#fff;cursor:pointer;opacity:0;visibility:hidden;transition:opacity .3s ease;text-shadow:0 1px 7px rgba(0,0,0,.55)}#fld:checked ~ .wrap .cx-l,#frs:checked ~ .wrap .cx-r,#fst:checked ~ .wrap .cx-s{opacity:1;visibility:visible}</style><style>.lace-card.bk{padding:14% 17%}.dmenu{display:flex;flex-direction:column;align-items:center;width:100%;margin-top:.5rem}.ditem{font-family:'Cormorant Garamond',serif;font-size:1.12rem;color:#5a4a28;line-height:1.1;padding:.46rem .2rem;width:100%;text-align:center;cursor:pointer;letter-spacing:.01em}.ditem + .ditem{border-top:1px solid rgba(176,141,60,.3)}.ditem .dsub{display:block;font-family:'Inter',sans-serif;font-size:.5rem;letter-spacing:.18em;text-transform:uppercase;color:#9a7b3a;margin-top:.12rem}</style><style>.dmenu details.dacc{width:100%;border-top:1px solid rgba(176,141,60,.28)}.dmenu details.dacc:first-child{border-top:0}.dmenu summary.ditem{display:block;list-style:none}.dmenu summary.ditem::-webkit-details-marker{display:none}.dmenu details.dacc[open] summary.ditem{color:#b08d3c}.dpanel{font-family:'Cormorant Garamond',serif;font-size:.98rem;color:#3a2f1c;line-height:1.42;text-align:center;padding:.05rem .25rem .55rem}</style><style>.lace-card.bk{padding:11% 12%}.dpanel{background:#fffdf8;border:1px solid rgba(176,141,60,.3);border-radius:13px;box-shadow:0 3px 12px rgba(20,26,12,.18);padding:.6rem .7rem .75rem;margin:.3rem 0 .12rem;text-align:center}.dpanel.ei{padding:.65rem .7rem .85rem}.eirow{display:flex;flex-direction:column;align-items:center;text-align:center;padding:.26rem 0}.eirow + .eirow{border-top:1px solid rgba(176,141,60,.16)}.eik{font-family:'Inter',sans-serif;font-size:.52rem;letter-spacing:.18em;text-transform:uppercase;color:#9a7b3a}.eiv{font-family:'Cormorant Garamond',serif;font-size:.98rem;color:#3a2f1c;line-height:1.22;margin-top:.05rem}.eimap{display:inline-block;margin:.55rem auto .1rem;font-family:'Inter',sans-serif;font-size:.56rem;letter-spacing:.14em;text-transform:uppercase;color:#5e7548;border:1px solid rgba(94,117,72,.5);border-radius:999px;padding:.34rem .9rem;text-decoration:none;cursor:pointer}.dress{margin-top:.7rem}.dress-lbl{display:block;font-family:'Inter',sans-serif;font-size:.54rem;letter-spacing:.16em;text-transform:uppercase;color:#9a7b3a;margin-bottom:.4rem}.swatches{display:flex;justify-content:center;gap:.4rem}.sw{width:22px;height:22px;border-radius:50%;box-shadow:0 1px 3px rgba(20,26,12,.35);border:1.5px solid rgba(255,255,255,.65)}</style><style>.dpanel.sch{padding:.65rem .55rem .85rem}.sec-h{display:block;font-family:'Great Vibes',cursive;font-size:1.8rem;color:#b08d3c;line-height:1;margin:.05rem 0 .55rem}.sec-h2{margin-top:.85rem}.sgrid{display:grid;grid-template-columns:1fr 1fr;gap:.85rem .4rem}.sitem{display:flex;flex-direction:column;align-items:center;text-align:center}.sicon{width:36px;height:34px;stroke:#6a5230;fill:none;stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round;margin-bottom:.22rem}.stime{font-family:'Cormorant Garamond',serif;font-size:.98rem;color:#3a2f1c;font-weight:600;line-height:1}.slabel{font-family:'Inter',sans-serif;font-size:.5rem;letter-spacing:.13em;text-transform:uppercase;color:#9a7b3a;margin-top:.12rem}.fgrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:.3rem;margin-top:.2rem}.fitem{display:flex;flex-direction:column;align-items:center;text-align:center}.flabel{font-family:'Cormorant Garamond',serif;font-size:.84rem;color:#3a2f1c;margin-top:.18rem;line-height:1.1}</style><style>.lace-card.bk{background:linear-gradient(rgba(253,248,239,.82),rgba(253,248,239,.82)),url(https://pahpjjubhbcbwqjpamwv.supabase.co/storage/v1/object/public/ai-site-images/previews/lace-doily-v1.png) center 24px/88% auto no-repeat,#fdf8ef;border-radius:10px;padding:12% 12% 9%}.lace-card.bk::before{content:"";position:absolute;inset:9px;border:1px solid #c4a35a;border-radius:6px;pointer-events:none}.lace-card.bk::after{content:"";position:absolute;inset:13px;border:1px solid rgba(196,163,90,.42);border-radius:3px;pointer-events:none}.dpanel{background:none;border:0;box-shadow:none;padding:.2rem .25rem .55rem;margin:0}.dmenu details.dacc{border-top:1px solid rgba(176,141,60,.25)}</style><style>.fdmenu{margin-top:.15rem}.facc{width:100%;border-top:1px solid rgba(176,141,60,.22)}.facc:first-child{border-top:0}.fsum{display:flex;align-items:center;justify-content:center;gap:.45rem;cursor:pointer;list-style:none;padding:.5rem .2rem;font-family:'Cormorant Garamond',serif;font-size:1.05rem;color:#3a2f1c}.fsum::-webkit-details-marker{display:none}.fsum .sicon{width:23px;height:23px;margin:0}.facc[open] .fsum{color:#b08d3c}.facc[open] .fsum .sicon{stroke:#b08d3c}.fbody{padding:.05rem .3rem .55rem}.mline{padding:.24rem 0;text-align:center}.mname{display:block;font-family:'Cormorant Garamond',serif;font-size:.98rem;color:#3a2f1c;line-height:1.18}.mdesc{display:block;font-family:'Inter',sans-serif;font-size:.52rem;letter-spacing:.1em;text-transform:uppercase;color:#9a7b3a;margin-top:.05rem}</style><style>.faq-a{font-family:'Cormorant Garamond',serif;font-size:.95rem;color:#3a2f1c;line-height:1.44;text-align:center;margin:.12rem .15rem .15rem}.faq-a + .faq-a{margin-top:.45rem}.faq-a strong{color:#6a5230}.tlist{text-align:center}.mingle-form{display:flex;flex-direction:column;gap:.5rem;max-width:270px;margin:.5rem auto .1rem}.mingle-lbl{font-family:'Inter',sans-serif;font-size:.54rem;letter-spacing:.16em;text-transform:uppercase;color:#9a7b3a;text-align:center;margin-bottom:.05rem}.mingle-in{font-family:'Cormorant Garamond',serif;font-size:.92rem;color:#3a2f1c;background:#fffdf8;border:1px solid rgba(176,141,60,.4);border-radius:9px;padding:.5rem .7rem;width:100%}.mingle-in::placeholder{color:#b6a888}.mingle-in[type=file]{font-size:.72rem;padding:.45rem .6rem;font-family:'Inter',sans-serif;color:#6a5230}.mingle-btn{font-family:'Inter',sans-serif;font-size:.56rem;letter-spacing:.16em;text-transform:uppercase;color:#fffdf8;background:#5e7548;border:none;border-radius:999px;padding:.6rem 1rem;cursor:pointer;margin-top:.15rem}.mingle-meet{display:block;text-align:center;font-family:'Inter',sans-serif;font-size:.52rem;letter-spacing:.18em;text-transform:uppercase;color:#9a7b3a;margin:.8rem 0 .45rem}.photo-album .album-form{display:none!important}.photo-album .album-grid{grid-template-columns:1fr 1fr!important;gap:.55rem!important;margin:0!important}.photo-album .album-item{background:#fffdf8!important;border:1px solid rgba(176,141,60,.3)!important;box-shadow:0 3px 10px rgba(20,26,12,.12)!important;border-radius:12px!important}.photo-album .album-item img{height:140px!important}.photo-album .album-item figcaption{font-family:'Cormorant Garamond',serif!important;color:#3a2f1c!important;opacity:1!important;font-size:.82rem!important;padding:.4rem .55rem!important;line-height:1.22!important}.photo-album .album-item figcaption em{color:#9a7b3a;font-size:.7rem}.photo-album .album-empty{font-family:'Cormorant Garamond',serif!important;color:#9a7b3a!important;font-size:.95rem!important}</style><style>#fld:checked ~ .wrap .lace-flip{position:fixed!important;inset:0!important;left:0!important;top:0!important;width:auto!important;height:auto!important;aspect-ratio:auto!important;max-height:none!important;transform:none!important;perspective:none!important;z-index:80;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:4vh 2vw;display:flex}#fld:checked ~ .wrap .lace-flip .fin{position:relative;width:min(94vw,480px);height:auto;margin:auto;transform:none;transform-style:flat;transition:none}#fld:checked ~ .wrap .lace-flip .ff{display:none!important}#fld:checked ~ .wrap .lace-flip .bk{position:relative!important;inset:auto!important;left:auto!important;top:auto!important;width:100%!important;height:auto!important;transform:none!important;overflow:visible!important;-webkit-backface-visibility:visible!important;backface-visibility:visible!important}</style><style>.dpanel.gal{padding:.5rem .3rem .6rem}.gal-grid{display:grid;grid-template-columns:1fr 1fr;gap:.4rem;margin:.15rem 0 .55rem}.ph{position:relative;margin:0;border-radius:7px;overflow:hidden;aspect-ratio:1/1;box-shadow:0 2px 7px rgba(20,26,12,.2)}.ph img{width:100%;height:100%;object-fit:cover;display:block}.ph .dl{position:absolute;bottom:6px;right:6px;width:27px;height:27px;border-radius:50%;background:rgba(28,34,22,.58);border:0;padding:0;display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}.ph .dl svg{width:15px;height:15px;stroke:#fff;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.gal-add{display:inline-flex;align-items:center;gap:.4rem;cursor:pointer;font-family:'Inter',sans-serif;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:#5e7548;border:1px solid rgba(94,117,72,.55);border-radius:999px;padding:.5rem 1.1rem}.gal-add .plus{font-size:1rem;line-height:1}.gal-note{margin-top:.45rem;font-family:'Inter',sans-serif;font-size:.5rem;letter-spacing:.08em;text-transform:uppercase;color:#9a7b3a}</style><style>.c-rsvp.bk{justify-content:flex-start;padding:14% 20px 28px;text-align:center}.c-rsvp.bk h2{margin-bottom:.05rem}.c-rsvp.bk .rule{margin:0 auto .4rem}.rmenu{width:100%;margin-top:.3rem}.c-rsvp.bk .dmenu details.dacc{border-top:1px solid rgba(216,192,121,.3)}.c-rsvp.bk .dmenu details.dacc:first-child{border-top:0}.c-rsvp.bk summary.ditem{color:#f1ecdc}.c-rsvp.bk details.dacc[open] summary.ditem{color:#ecd29a}.c-rsvp.bk .ditem .dsub{color:#c4d0b3}.c-rsvp.bk .dpanel{color:#f1ecdc;text-align:center}.c-rsvp.bk .faq-a{color:#eef2e6}.rfld{display:flex;flex-direction:column;gap:.26rem;padding:.34rem 0;text-align:center}.rfld>label{font-family:'Inter',sans-serif;font-size:.52rem;letter-spacing:.16em;text-transform:uppercase;color:#c4d0b3}.rfld>label em{font-style:normal;text-transform:none;letter-spacing:.04em;color:#9fb088}.rin{font-family:'Cormorant Garamond',serif;font-size:.95rem;color:#3a2f1c;background:#fffdf8;border:1px solid rgba(216,192,121,.5);border-radius:9px;padding:.5rem .7rem;width:100%;text-align:center;box-sizing:border-box}.rin::placeholder{color:#b6a888}select.rin{text-align-last:center;-webkit-appearance:none;appearance:none}textarea.rin{resize:none;line-height:1.32;text-align:left}.rseg{display:flex;gap:.45rem;justify-content:center;flex-wrap:wrap;margin-top:.1rem}.rseg label{cursor:pointer;display:inline-block;position:relative}.rseg input{position:absolute;opacity:0;width:0;height:0}.rseg span{display:block;border:1px solid rgba(216,192,121,.6);color:#f1ecdc;border-radius:999px;padding:.5rem .9rem;font-family:'Inter',sans-serif;font-size:.56rem;letter-spacing:.1em;text-transform:uppercase}.rseg input:checked+span{background:#ecd29a;color:#3a2f1c;border-color:#ecd29a}.rchk{display:flex;flex-direction:column;gap:.5rem;margin:.3rem auto .1rem;max-width:210px}.rchk label{display:flex;align-items:center;gap:.6rem;cursor:pointer;font-family:'Cormorant Garamond',serif;font-size:1rem;color:#f1ecdc;text-align:left}.rchk input{position:absolute;opacity:0;width:0;height:0}.rchk .box{flex:0 0 auto;width:18px;height:18px;border-radius:5px;border:1px solid rgba(216,192,121,.65);position:relative}.rchk input:checked+.box{background:#ecd29a;border-color:#ecd29a}.rchk input:checked+.box::after{content:"";position:absolute;left:6px;top:2px;width:4px;height:9px;border:solid #3a2f1c;border-width:0 2px 2px 0;transform:rotate(45deg)}.c-rsvp.bk .eimap{display:inline-block;margin:.5rem auto .2rem;color:#ecd29a;border:1px solid rgba(216,192,121,.6)}.rconf{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:1.05rem;color:#ecd29a;margin:.55rem .2rem .2rem;line-height:1.3}.rsum{margin-top:.1rem}.c-rsvp.bk .btn{margin:.7rem auto 0}</style><style>.c-rsvp.bk{justify-content:safe center;border-radius:16px;padding:9% 22px 9%;text-align:center}.c-rsvp.bk::before{inset:10px;border-radius:11px}.rstep-in{position:absolute;width:0;height:0;opacity:0;pointer-events:none}.rwiz{width:100%;display:flex;flex-direction:column;align-items:center}.rhead{margin-bottom:.5rem}.rhead .sub{display:block;font-size:.5rem;letter-spacing:.24em;text-transform:uppercase;color:#c4d0b3;margin-bottom:.08rem}.rhead h2{font-family:'Cormorant Garamond',serif;font-size:1.5rem;line-height:1;margin:0;color:#ecd29a}.rstep{display:none;flex-direction:column;align-items:center;width:100%}#rs1:checked~.rwiz .s1,#rs2:checked~.rwiz .s2,#rs3:checked~.rwiz .s3,#rs4:checked~.rwiz .s4,#rs5:checked~.rwiz .s5,#rs6:checked~.rwiz .s6,#rs7:checked~.rwiz .s7{display:flex}.rtitle{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:1.55rem;color:#f3ecda;line-height:1}.rcap{font-family:'Inter',sans-serif;font-size:.5rem;letter-spacing:.2em;text-transform:uppercase;color:#c4d0b3;margin:.22rem 0 .6rem}.rnav{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:.5rem;width:100%;margin-top:1.2rem}.rnav .rback{justify-self:start}.rnav .rdots{justify-self:center}.rnav .rnext,.rnav .rsend{justify-self:end}.rback,.rnext{cursor:pointer;font-family:'Inter',sans-serif;font-size:.56rem;letter-spacing:.14em;text-transform:uppercase;padding:.4rem .1rem;white-space:nowrap}.rback{color:#d8d0bb}.rnext{color:#ecd29a}.rdots{display:flex;gap:.34rem}.rdots i{width:6px;height:6px;border-radius:50%;background:rgba(231,224,203,.3)}.rdots i.on{background:#ecd29a}.rsend{cursor:pointer;font-family:'Inter',sans-serif;font-size:.54rem;letter-spacing:.1em;text-transform:uppercase;background:#ecd29a;color:#3a2f1c;border-radius:999px;padding:.6rem 1rem;white-space:nowrap}.rseg.big{flex-direction:column;gap:.55rem;width:100%;max-width:235px;margin:.2rem auto 0}.rseg.big label{display:block;width:100%}.rseg.big span{padding:.74rem 1rem;font-size:.6rem}.c-rsvp.bk .rfld{max-width:280px;margin:0 auto}</style><style>.story-card.bk{border-radius:16px;padding:12% 24px 24px;justify-content:safe center}.story-card.bk::before{inset:10px;border-radius:11px}.story-card.bk .st-title{font-size:2.3rem;margin-bottom:.35rem}.smenu{width:100%;margin-top:.1rem}.story-card.bk .dpanel .faq-a{margin:.1rem .1rem .15rem}.couple{display:flex;flex-direction:column;gap:.7rem;margin-top:.1rem}.partner{text-align:center}.partner+.partner{border-top:1px solid rgba(176,141,60,.25);padding-top:.65rem}.pname{display:block;font-family:'Great Vibes',cursive;font-size:1.7rem;color:#b08d3c;line-height:1}.prole{display:block;font-family:'Inter',sans-serif;font-size:.5rem;letter-spacing:.18em;text-transform:uppercase;color:#9a7b3a;margin:.06rem 0 .28rem}.pbio{font-family:'Cormorant Garamond',serif;font-size:.92rem;color:#3a2f1c;line-height:1.4}</style><style>.shero{display:flex;flex-direction:column;align-items:center;text-align:center;margin-bottom:.5rem}.shero-photo{width:100%;max-width:320px;aspect-ratio:4/3;object-fit:cover;border-radius:12px;box-shadow:0 5px 16px rgba(20,26,12,.22);margin-bottom:.5rem}.shero-eyebrow{font-family:'Inter',sans-serif;font-size:.5rem;letter-spacing:.24em;text-transform:uppercase;color:#9a7b3a}.shero-date{font-family:'Inter',sans-serif;font-size:.55rem;letter-spacing:.2em;text-transform:uppercase;color:#9a7b3a;margin-top:.12rem}.shero-intro{font-family:'Cormorant Garamond',serif;font-size:.96rem;color:#3a2f1c;line-height:1.42;margin-top:.4rem}.story-h{display:block;font-family:'Great Vibes',cursive;font-size:1.5rem;color:#b08d3c;line-height:1;margin-bottom:.18rem}.sphotos{display:grid;grid-template-columns:1fr 1fr;gap:.4rem;margin:.45rem 0 .15rem}.sphotos img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:9px;display:block;box-shadow:0 2px 8px rgba(20,26,12,.18)}.ph-lbl{display:block;font-family:'Inter',sans-serif;font-size:.5rem;letter-spacing:.18em;text-transform:uppercase;color:#9a7b3a;margin:.55rem 0 .1rem}.pphoto{width:88px;height:88px;border-radius:50%;object-fit:cover;box-shadow:0 3px 11px rgba(20,26,12,.22);margin-bottom:.4rem}.funfacts{margin-top:.5rem}.ff-lbl{display:block;font-family:'Inter',sans-serif;font-size:.5rem;letter-spacing:.18em;text-transform:uppercase;color:#9a7b3a;margin-bottom:.28rem}.ff-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:.22rem}.ff-list li{font-family:'Cormorant Garamond',serif;font-size:.9rem;color:#3a2f1c;line-height:1.32}.ff-list li::before{content:"♥ ";color:#c7a85e;font-size:.72rem}</style><style>.fchk{position:absolute!important;width:1px;height:1px;opacity:0;pointer-events:none;margin:-1px;padding:0;border:0;clip:rect(0 0 0 0);overflow:hidden}</style><style>body::before{inset:auto;top:0;left:0;width:100vw;width:100lvw;height:100vh;height:100lvh}body::after{inset:auto;top:0;left:0;width:100vw;width:100lvw;height:100vh;height:100lvh}html:has(.fchk:checked),body:has(.fchk:checked){overflow:hidden}.flip,.flip .face{overscroll-behavior:contain}</style><style>@media (orientation:landscape) and (max-height:600px) and (pointer:coarse){.wrap{max-width:430px}.hero{min-height:auto;padding:5vh 0 2vh}}</style><style>.wrap{max-width:430px}</style><style>@media (min-width:768px) and (min-height:601px){html{font-size:140%}.wrap{max-width:600px}.names{font-size:clamp(42px,6vw,58px)}.c-photo{max-width:160px}.c-photo.pL{max-width:126px}.c-details{max-width:221px}.c-rsvp{max-width:329px}.cards .rsvp-flip{max-width:329px}.story-flip{width:420px}.cards .cw.sl2{height:616px}.cw.sr{height:320px}.cards .c-details.t-left{transform:translateY(35px) rotate(-4deg)}#frs:checked ~ .wrap .rsvp-flip,#fst:checked ~ .wrap .story-flip{width:min(94vw,672px);height:min(92vh,900px)}#fld:checked ~ .wrap .lace-flip .fin{width:min(94vw,672px)}.c-rsvp.bk .rfld{max-width:392px}.shero-photo{max-width:448px}.rchk{max-width:294px}.rseg.big{max-width:329px}.mingle-form{max-width:378px}}</style></head>
<body>
<input type="checkbox" id="fld" class="fchk"><input type="checkbox" id="frs" class="fchk"><input type="checkbox" id="fst" class="fchk">
<div class="wrap">
  <section class="hero">
    <div class="eyebrow">Together with our families</div>
    <h1 class="names">{{NAME1}} <span class="amp">&amp;</span> {{NAME2}}</h1>
    <div class="invite">are inviting you…</div>
  </section>
  <section class="cards"><img class="seal" src="https://pahpjjubhbcbwqjpamwv.supabase.co/storage/v1/object/public/ai-site-images/previews/wax-seal-v2.png" alt=""></img><img class="euc euc-a" src="https://pahpjjubhbcbwqjpamwv.supabase.co/storage/v1/object/public/ai-site-images/previews/eucalyptus-3-v1.png" alt=""><img class="euc euc-b" src="https://pahpjjubhbcbwqjpamwv.supabase.co/storage/v1/object/public/ai-site-images/previews/eucalyptus-3-v1.png" alt=""><img class="euc euc-c" src="https://pahpjjubhbcbwqjpamwv.supabase.co/storage/v1/object/public/ai-site-images/previews/eucalyptus-3-v1.png" alt=""><div class="flip lace-flip"><div class="fin"><label for="fld" class="face ff lace-card"><span class="l1">Tap here for the</span><span class="l2">Details</span></label><div class="face bk lace-card"><span class="bl-sub">Explore</span><span class="bl-h">The Details</span><div class="dmenu"><details class="dacc"><summary class="ditem">Event Information</summary><div class="dpanel ei"><div class="eirow"><span class="eik">Event</span><span class="eiv">The Wedding of {{NAME1}} &amp; {{NAME2}}</span></div><div class="eirow"><span class="eik">Date</span><span class="eiv">{{DATE_FULL}}</span></div><div class="eirow"><span class="eik">Start Time</span><span class="eiv">{{TIME_START}}</span></div><div class="eirow"><span class="eik">End Time</span><span class="eiv">{{TIME_END}}</span></div><div class="eirow"><span class="eik">Venue</span><span class="eiv">{{VENUE}}</span></div><div class="eirow"><span class="eik">Address</span><span class="eiv">{{ADDRESS}}</span></div><a class="eimap" href="https://www.google.com/maps/search/?api=1&amp;query={{MAP_Q}}" target="_blank" rel="noopener">View on Google Maps</a><div class="dress"><span class="dress-lbl">Dress Code &middot; {{DRESS_CODE}}</span>{{SWATCHES}}</div></div></details><details class="dacc"><summary class="ditem">Schedule &middot; Food &amp; Drinks</summary><div class="dpanel sch"><span class="sec-h">Schedule</span>{{SCHEDULE}}<span class="sec-h sec-h2">Food &amp; Drinks</span>{{MENUS}}</div></details><details class="dacc"><summary class="ditem">Photo Gallery<span class="dsub">share your photos</span></summary><div class="dpanel gal">{{GALLERY}}<label class="gal-add"><input type="file" id="galInput" accept="image/*" multiple hidden><span class="plus">+</span> Add Photos</label><div class="gal-note">Tap a photo&rsquo;s arrow to download &middot; add your own above</div></div></details><details class="dacc"><summary class="ditem">Singles Page<span class="dsub">single &amp; ready to mingle</span></summary><div class="dpanel"><span class="sec-h">Singles Mingle</span><p class="faq-a">Flying solo at our wedding? Add yourself to the wall &mdash; or nominate a fabulous single friend! Drop in a photo and a few words about yourself, then scroll down to see who else is looking to mingle. You never know who you&rsquo;ll meet on the dance floor. &#9825;</p><form class="mingle-form" method="POST" action="https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/ai-site-photos?slug={{SLUG}}" enctype="multipart/form-data"><span class="mingle-lbl">Add yourself to the wall</span><input class="mingle-in" type="file" name="file" accept="image/*" required><input class="mingle-in" type="text" name="name" placeholder="Your first name" maxlength="80"><input class="mingle-in" type="text" name="caption" placeholder="A few words about you &mdash; your vibe, what you love&hellip;" maxlength="280"><button class="mingle-btn" type="submit">Add me to the wall</button></form><span class="mingle-meet">&#9662;&ensp;Meet the singles&ensp;&#9662;</span>__PHOTO_ALBUM__</div></details><details class="dacc"><summary class="ditem">Travel &amp; Stay<span class="dsub">getting here &middot; where to stay</span></summary><div class="dpanel">{{TRAVEL}}</div></details><details class="dacc"><summary class="ditem">FAQ<span class="dsub">good to know</span></summary><div class="dpanel">{{FAQ}}</div></details></div></div></div></div><div class="flip story-flip"><div class="fin"><label for="fst" class="face ff story-card"><div class="st-sub">the beginning of</div><span class="st-title">Our Story</span><p class="st-p">From a chance hello to forever.</p></label><div class="face bk story-card sb"><div class="shero"><img class="shero-photo" src="{{HERO_PHOTO}}" alt="{{NAME1}} &amp; {{NAME2}}"><span class="shero-eyebrow">Our Story</span><span class="st-title">{{NAME1}} &amp; {{NAME2}}</span><span class="shero-date">{{DATE_LONG}}</span><p class="shero-intro">{{HERO_INTRO}}</p></div><div class="dmenu smenu"><details class="dacc" open><summary class="ditem">How We Met</summary><div class="dpanel">{{STORY_HOWMET}}</div></details><details class="dacc"><summary class="ditem">First Date</summary><div class="dpanel">{{STORY_FIRSTDATE}}</div></details><details class="dacc"><summary class="ditem">Proposal Story</summary><div class="dpanel">{{STORY_PROPOSAL}}</div></details><details class="dacc"><summary class="ditem">Meet the Couple<span class="dsub">the two of us</span></summary><div class="dpanel"><div class="couple">{{PARTNERS}}</div></div></details></div></div></div></div><img class="envelope" src="https://pahpjjubhbcbwqjpamwv.supabase.co/storage/v1/object/public/ai-site-images/previews/envelope-v5.png" alt=""><img class="tray" src="https://pahpjjubhbcbwqjpamwv.supabase.co/storage/v1/object/public/ai-site-images/previews/gold-tray-v2.png" alt=""><img class="ringbox" src="https://pahpjjubhbcbwqjpamwv.supabase.co/storage/v1/object/public/ai-site-images/previews/ringbox-v7.png" alt="">
    <!-- THE DETAILS — tilted left -->
    <div class="cw sl"><div class="card c-details t-left">
      <div class="mono">{{INIT1}} <span class="amp">&amp;</span> {{INIT2}}</div>
      <svg class="rule" viewBox="0 0 160 14" width="86"><line x1="0" y1="7" x2="62" y2="7" stroke="currentColor" stroke-width=".7"/><circle cx="80" cy="7" r="2.4" fill="currentColor"/><line x1="98" y1="7" x2="160" y2="7" stroke="currentColor" stroke-width=".7"/></svg>
      <div class="drow"><div class="dk">Date</div><div class="dv">{{DATE_LONG}}</div></div>
      <div class="drow"><div class="dk">Time</div><div class="dv">Four o'clock in the afternoon</div></div>
      <div class="drow"><div class="dk">Where</div><div class="dv">{{VENUE}}</div></div>
    </div></div>
    <!-- PHOTO — tilted right -->
    <div class="cw sr"><div class="card c-photo pL"><img src="https://images.unsplash.com/photo-1519741497674-611481863552?w=600&q=80&auto=format,compress&fit=crop" alt="{{NAME1}} and {{NAME2}}"></div><div class="card c-photo pR">
      <img src="https://images.unsplash.com/photo-1519741497674-611481863552?w=600&q=80&auto=format,compress&fit=crop" alt="{{NAME1}} and {{NAME2}}">
    </div>
    </div>
    <!-- RSVP — tilted left -->
    <div class="cw sl2"><div class="flip rsvp-flip"><div class="fin"><label for="frs" class="face ff card post c-rsvp"><div class="sub">Kindly</div><h2>RSVP</h2><svg class="rule" viewBox="0 0 160 14" width="118"><line x1="0" y1="7" x2="62" y2="7" stroke="currentColor" stroke-width=".7"/><circle cx="80" cy="7" r="2.4" fill="currentColor"/><line x1="98" y1="7" x2="160" y2="7" stroke="currentColor" stroke-width=".7"/></svg><div class="rf-note">Tap to respond</div></label><div class="face bk card post c-rsvp"><input class="rstep-in" type="radio" name="rstep" id="rs1" checked><input class="rstep-in" type="radio" name="rstep" id="rs2"><input class="rstep-in" type="radio" name="rstep" id="rs3"><input class="rstep-in" type="radio" name="rstep" id="rs4"><input class="rstep-in" type="radio" name="rstep" id="rs5"><input class="rstep-in" type="radio" name="rstep" id="rs6"><input class="rstep-in" type="radio" name="rstep" id="rs7"><div class="rwiz"><div class="rhead"><span class="sub">Kindly</span><h2>RSVP</h2></div><div class="rstep s1"><span class="rtitle">Guest Information</span><span class="rcap">Who&rsquo;s responding</span><div class="rfld"><label>Guest Name</label><input class="rin" type="text" placeholder="First &amp; last name"></div><div class="rfld"><label>Email Address</label><input class="rin" type="email" placeholder="you@example.com"></div><div class="rfld"><label>Phone Number <em>&middot; optional</em></label><input class="rin" type="tel" placeholder="(555) 123-4567"></div><div class="rnav"><span></span><div class="rdots"><i class="on"></i><i></i><i></i><i></i><i></i><i></i><i></i></div><label for="rs2" class="rnext">Next &rsaquo;</label></div></div><div class="rstep s2"><span class="rtitle">Attendance</span><span class="rcap">Will you join us</span><div class="rseg big"><label><input type="radio" name="attend" checked><span>Will Attend</span></label><label><input type="radio" name="attend"><span>Will Not Attend</span></label></div><div class="rnav"><label for="rs1" class="rback">&lsaquo; Back</label><div class="rdots"><i></i><i class="on"></i><i></i><i></i><i></i><i></i><i></i></div><label for="rs3" class="rnext">Next &rsaquo;</label></div></div><div class="rstep s3"><span class="rtitle">Plus One</span><span class="rcap">Bringing a guest</span><div class="rfld"><label>Bringing a Guest?</label><div class="rseg"><label><input type="radio" name="plusone"><span>Yes</span></label><label><input type="radio" name="plusone" checked><span>No</span></label></div></div><div class="rfld"><label>Guest Name</label><input class="rin" type="text" placeholder="Your guest&rsquo;s name"></div><div class="rnav"><label for="rs2" class="rback">&lsaquo; Back</label><div class="rdots"><i></i><i></i><i class="on"></i><i></i><i></i><i></i><i></i></div><label for="rs4" class="rnext">Next &rsaquo;</label></div></div><div class="rstep s4"><span class="rtitle">Event Selection</span><span class="rcap">Which events</span><div class="rchk">{{EVENTS}}</div><div class="rnav"><label for="rs3" class="rback">&lsaquo; Back</label><div class="rdots"><i></i><i></i><i></i><i class="on"></i><i></i><i></i><i></i></div><label for="rs5" class="rnext">Next &rsaquo;</label></div></div><div class="rstep s5"><span class="rtitle">Meal Selection</span><span class="rcap">Dining preferences</span><div class="rfld"><label>Meal Choice</label><select class="rin">{{MEAL_OPTS}}</select></div><div class="rfld"><label>Dietary Restrictions</label><input class="rin" type="text" placeholder="Vegetarian, vegan, gluten-free&hellip;"></div><div class="rfld"><label>Food Allergies</label><input class="rin" type="text" placeholder="Let us know what to avoid"></div><div class="rnav"><label for="rs4" class="rback">&lsaquo; Back</label><div class="rdots"><i></i><i></i><i></i><i></i><i class="on"></i><i></i><i></i></div><label for="rs6" class="rnext">Next &rsaquo;</label></div></div><div class="rstep s6"><span class="rtitle">Additional Information</span><span class="rcap">Notes &amp; extras</span><div class="rfld"><label>Song Request</label><input class="rin" type="text" placeholder="A song to get you on the floor"></div><div class="rfld"><label>Message for the Couple</label><textarea class="rin" rows="3" placeholder="Share your well-wishes&hellip;"></textarea></div><div class="rfld"><label>Transportation Needed?</label><div class="rseg"><label><input type="radio" name="transport"><span>Yes</span></label><label><input type="radio" name="transport" checked><span>No</span></label></div></div><div class="rnav"><label for="rs5" class="rback">&lsaquo; Back</label><div class="rdots"><i></i><i></i><i></i><i></i><i></i><i class="on"></i><i></i></div><label for="rs7" class="rnext">Next &rsaquo;</label></div></div><div class="rstep s7"><span class="rtitle">Confirmation</span><span class="rcap">Review &amp; send</span><p class="faq-a rsum">Use Back to review your answers, then send your RSVP. We&rsquo;ll email a confirmation with everything you need.</p><a class="eimap" href="https://pahpjjubhbcbwqjpamwv.supabase.co/functions/v1/ai-site-ics?slug={{SLUG}}">Add to your calendar</a><p class="rconf">We can&rsquo;t wait to celebrate with you. &#9825;</p><div class="rnav"><label for="rs6" class="rback">&lsaquo; Back</label><div class="rdots"><i></i><i></i><i></i><i></i><i></i><i></i><i class="on"></i></div><span class="rsend">Send RSVP</span></div></div></div></div></div></div></div>
  </section>
  <section class="signoff"><div class="so-pre">{{SIGNOFF_PRE}}</div><div class="so-sig">{{NAME1}} &amp; {{NAME2}}</div></section>
  <section class="countdown">
    <div class="ct">Counting down to forever</div>
    <div class="cd-foot">
      <div class="cell"><div class="num">135</div><div class="lbl">Days</div></div>
      <div class="cell"><div class="num">Oct 11</div><div class="lbl">Date</div></div>
      <div class="cell"><div class="num">2026</div><div class="lbl">Year</div></div>
    </div>
  </section><label class="flip-bg lace-bg" for="fld"></label><label class="flip-bg rsvp-bg" for="frs"></label><label class="flip-bg story-bg" for="fst"></label><label class="cx cx-l" for="fld">×</label><label class="cx cx-r" for="frs">×</label><label class="cx cx-s" for="fst">×</label>
</div>
<script>(function(){function dl(u,n){fetch(u,{mode:"cors"}).then(function(r){return r.blob()}).then(function(b){var a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=n||"photo.jpg";document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href)},5000);}).catch(function(){window.open(u,"_blank")})}document.addEventListener("click",function(e){var d=e.target.closest&&e.target.closest(".dl");if(!d)return;e.preventDefault();dl(d.getAttribute("data-src"),d.getAttribute("data-name"))});var inp=document.getElementById("galInput");if(inp){inp.addEventListener("change",function(){var g=document.getElementById("galGrid");Array.prototype.forEach.call(inp.files,function(f){var u=URL.createObjectURL(f);var fig=document.createElement("figure");fig.className="ph";fig.innerHTML='<img src="'+u+'" alt=""><button class="dl" data-src="'+u+'" data-name="'+f.name+'"><svg viewBox="0 0 24 24"><path d="M12 4v11"/><path d="M8 12l4 4 4-4"/><path d="M5 19h14"/></svg></button>';g.appendChild(fig)});inp.value=""})}})();</script></body></html>
`;
const icon = (k: string) => ICONS[k] ?? "";

function renderSchedule(items: ScheduleItem[]): string {
  return `<div class="sgrid">` + items.map((it) => `<div class="sitem">${icon(it.iconKey)}<span class="stime">${it.time}</span><span class="slabel">${it.label}</span></div>`).join("") + `</div>`;
}
function renderMenus(groups: MenuGroup[]): string {
  return `<div class="fdmenu">` + groups.map((g) =>
    `<details class="facc"><summary class="fsum">${icon(g.iconKey)}<span>${g.title}</span></summary><div class="fbody">` +
    g.items.map((it) => `<div class="mline"><span class="mname">${it.name}</span>${it.desc !== undefined ? `<span class="mdesc">${it.desc}</span>` : ""}</div>`).join("") +
    `</div></details>`).join("") + `</div>`;
}

const DL_SVG = `<svg viewBox="0 0 24 24"><path d="M12 4v11"/><path d="M8 12l4 4 4-4"/><path d="M5 19h14"/></svg>`;
const sphotos = (ps: string[]) => `<div class="sphotos">` + ps.map((s) => `<img src="${s}" alt="" loading="lazy">`).join("") + `</div>`;

function renderSwatches(cs: string[]): string {
  return `<div class="swatches">` + cs.map((c) => `<span class="sw" style="background:${c}"></span>`).join("") + `</div>`;
}
function renderGallery(ps: GalleryPhoto[]): string {
  return `<div class="gal-grid" id="galGrid">` + ps.map((p) =>
    `<figure class="ph"><img src="${p.src}" alt="Wedding photo" loading="lazy"><button class="dl" data-src="${p.src}" data-name="${p.name}">${DL_SVG}</button></figure>`).join("") + `</div>`;
}
function renderHowMet(s: StorySection): string {
  return `<span class="story-h">${s.title ?? ""}</span><p class="faq-a">${s.body}</p>` + sphotos(s.photos);
}
function renderFirstDate(s: StorySection): string {
  return `<p class="faq-a">${s.body}</p>` + sphotos(s.photos);
}
function renderProposal(s: ProposalSection): string {
  return `<p class="faq-a">${s.body}</p><span class="ph-lbl">The Proposal</span>` + sphotos(s.proposalPhotos) + `<span class="ph-lbl">The Engagement</span>` + sphotos(s.engagementPhotos);
}
function renderPartners(spec: FlatLaySpec): string {
  return spec.partners.map((p, i) => {
    const name = i === 0 ? spec.name1 : spec.name2;
    return `<div class="partner"><img class="pphoto" src="${p.photo}" alt="${name}"><span class="pname">${name}</span><span class="prole">${p.role}</span><p class="pbio">${p.bio}</p><div class="funfacts"><span class="ff-lbl">${p.ffLabel}</span><ul class="ff-list">` + p.ffacts.map((f) => `<li>${f}</li>`).join("") + `</ul></div></div>`;
  }).join("");
}

function renderAccordion(items: AccItem[]): string {
  return `<div class="fdmenu">` + items.map((it) =>
    `<details class="facc"><summary class="fsum">${icon(it.iconKey)}<span>${it.title}</span></summary><div class="fbody">${it.body}</div></details>`).join("") + `</div>`;
}
function renderEvents(evs: { label: string; checked: boolean }[]): string {
  return evs.map((e) => `<label><input type="checkbox"${e.checked ? " checked" : ""}><span class="box"></span>${e.label}</label>`).join("");
}

export function composeFlatLay(spec: FlatLaySpec): string {
  let out = TEMPLATE;
  out = out.split("{{SCHEDULE}}").join(renderSchedule(spec.schedule));
  out = out.split("{{MENUS}}").join(renderMenus(spec.menus));
  out = out.split("{{TRAVEL}}").join(renderAccordion(spec.travel));
  out = out.split("{{FAQ}}").join(renderAccordion(spec.faqs));
  out = out.split("{{MEAL_OPTS}}").join(spec.mealOptions.map((o) => `<option>${o}</option>`).join(""));
  out = out.split("{{EVENTS}}").join(renderEvents(spec.events));
  out = out.split("{{SWATCHES}}").join(renderSwatches(spec.swatches));
  out = out.split("{{GALLERY}}").join(renderGallery(spec.gallery));
  out = out.split("{{STORY_HOWMET}}").join(renderHowMet(spec.story.howMet));
  out = out.split("{{STORY_FIRSTDATE}}").join(renderFirstDate(spec.story.firstDate));
  out = out.split("{{STORY_PROPOSAL}}").join(renderProposal(spec.story.proposal));
  out = out.split("{{PARTNERS}}").join(renderPartners(spec));
  out = out.split("{{HERO_PHOTO}}").join(spec.heroPhoto);
  out = out.split("{{HERO_INTRO}}").join(spec.heroIntro);
  const scal: Record<string, string> = {
    "{{SLUG}}": spec.slug, "{{NAME1}}": spec.name1, "{{NAME2}}": spec.name2,
    "{{INIT1}}": spec.init1, "{{INIT2}}": spec.init2,
    "{{DATE_FULL}}": spec.dateFull, "{{DATE_LONG}}": spec.dateLong,
    "{{TIME_START}}": spec.timeStart, "{{TIME_END}}": spec.timeEnd,
    "{{VENUE}}": spec.venue, "{{ADDRESS}}": spec.address, "{{MAP_Q}}": spec.mapQuery,
    "{{DRESS_CODE}}": spec.dressCode, "{{SIGNOFF_PRE}}": spec.signoffPre,
  };
  for (const [k, v] of Object.entries(scal)) out = out.split(k).join(v);
  return out;
}
