// FAQ content per vendor category. These render as a real accordion on
// category landing pages AND as FAQPage JSON-LD — Google will surface the
// Q&A directly in search results when the structured data validates.
//
// Keep answers ~30-80 words. Specific, useful, no AI-flavored hedging.

export interface FaqItem {
  q: string;
  a: string;
}

const SHARED_END: FaqItem[] = [
  {
    q: "Are vendors on Vendora vetted?",
    a: "Yes — every vendor is hand-reviewed by our editorial team for portfolio quality, professional standing, and references before being approved to list. We don't run an open marketplace.",
  },
  {
    q: "Is there a fee to book through Vendora?",
    a: "Browsing and contacting vendors is free for hosts. You pay each vendor directly through the platform — Vendora does not add markups to vendor pricing.",
  },
];

export const CATEGORY_FAQS: Record<string, FaqItem[]> = {
  photographers: [
    {
      q: "How much does a wedding photographer cost?",
      a: "Most full-day wedding photography packages on Vendora range from $3,500 to $9,500, with documentary specialists and editorial photographers commanding the higher end. Pricing depends on coverage hours, second-shooter, deliverables (album, prints), and travel.",
    },
    {
      q: "How far in advance should I book a photographer?",
      a: "9-12 months out for peak-season weddings (May-October). For milestone birthdays, holiday events, and smaller gatherings, 6-8 weeks is typically enough. The most in-demand photographers book a year out.",
    },
    {
      q: "What's the difference between editorial and documentary wedding photography?",
      a: "Editorial photographers stage and direct images for a polished, magazine-style look. Documentary (or photojournalistic) photographers capture moments as they unfold without intervention. Many photographers blend both — ask for a full event gallery to see how each approaches your style.",
    },
    {
      q: "Do photographers include the raw files?",
      a: "Most don't. Standard delivery is 400-800 edited high-resolution JPEGs. Raw file delivery is uncommon and usually carries an additional fee. Always confirm deliverables in your contract.",
    },
    ...SHARED_END,
  ],
  florists: [
    {
      q: "How much should I budget for wedding florals?",
      a: "Budget 8-15% of your total wedding spend on florals. Personal flowers (bouquets, boutonnieres) start around $700-1,200; ceremony installations and reception centerpieces can range from $2,500 to $20,000+ depending on scale and the florals chosen.",
    },
    {
      q: "When should I book a florist?",
      a: "6-9 months before the event. Florists need time to source seasonal stems, sketch design proposals, and coordinate with your venue. For large installations or specialty flowers (peonies, ranunculus), book even earlier.",
    },
    {
      q: "Are seasonal flowers cheaper?",
      a: "Yes — significantly. In-season blooms are 30-50% less expensive than imported off-season equivalents and they last longer once cut. Most florists will recommend a seasonal palette if your color scheme is flexible.",
    },
    {
      q: "Will the florist set up and break down on the day?",
      a: "Most full-service florists handle setup, on-site adjustments, and breakdown — confirm in your contract. Some venues charge breakdown fees if florals aren't removed by a specified time, so coordinate timing with your planner.",
    },
    ...SHARED_END,
  ],
  catering: [
    {
      q: "How much does wedding catering cost per person?",
      a: "Plated dinner service typically runs $150-350 per person on Vendora; family-style and stations sit a bit lower; tasting-menu and chef-driven multi-course experiences can exceed $500 per person. Bar service is usually quoted separately.",
    },
    {
      q: "Do caterers handle rentals?",
      a: "Many do — table linens, glassware, flatware, and china can either be bundled into the catering quote or coordinated separately. Bundled is usually less expensive. Always check whether staffing, cake-cutting fees, and gratuity are itemized.",
    },
    {
      q: "Should I do a tasting before booking?",
      a: "Yes. Most caterers offer a complimentary or low-cost tasting after a booking is confirmed; some offer a paid pre-booking tasting. The tasting locks in your menu and lets you see plating quality before the event.",
    },
    {
      q: "How far in advance should I book catering?",
      a: "8-12 months for weddings, 6-8 weeks for smaller dinners and milestone events. Holiday-season catering (November-December) books out months in advance — especially for in-demand kitchens and venues with exclusive caterer lists.",
    },
    ...SHARED_END,
  ],
  djs: [
    {
      q: "How much does a wedding DJ cost?",
      a: "Most wedding DJs on Vendora charge $1,800-4,500 for 5-6 hours of coverage including ceremony audio, dinner playlists, and dance-floor reception. Premium DJs with custom setups, additional speakers, or live percussion can run higher.",
    },
    {
      q: "DJ vs band — which should I book?",
      a: "DJs are more flexible (any genre, any era, no breaks), occupy less floor space, and cost less. Bands bring presence and energy but cost 2-4x as much, take breaks, and are limited to their repertoire. Many couples blend the two — band for cocktail hour, DJ for reception.",
    },
    {
      q: "Will the DJ MC the event?",
      a: "Most do. Confirm whether MC duties are included in the base fee — toast announcements, last-call calls, and special-dance introductions matter for the room's energy. Ask for a sample of their MC voice if you've never heard them.",
    },
    {
      q: "Can we send the DJ a do-not-play list?",
      a: "Yes — every professional DJ welcomes both must-play and do-not-play lists. Send these 4-6 weeks before the event. Be specific (entire artists, songs, or genres) so there are no surprises.",
    },
    ...SHARED_END,
  ],
  venues: [
    {
      q: "How much does a wedding venue cost?",
      a: "Venue rental fees on Vendora range from $5,000 for intimate restaurants and lofts to $40,000+ for full-buyout estates and architectural landmarks. Most include tables, chairs, and basic lighting; check what's bundled and what's an add-on.",
    },
    {
      q: "What's the difference between a buyout and a private event rental?",
      a: "A full buyout means the entire venue is yours — bar, kitchen, multiple rooms — typically with strict minimums on food and beverage spend. A private event rental gives you a defined space within a larger venue, often less expensive but with overlap to other guests.",
    },
    {
      q: "When should I tour and book my venue?",
      a: "Venue is the first thing to lock in — usually 9-14 months before the event. Once the venue is set, the date is set, which lets you confirm everyone else.",
    },
    {
      q: "Are vendor restrictions a deal-breaker?",
      a: "Some venues require you to use their in-house catering or work from a preferred vendor list. This isn't always bad — preferred lists are usually pre-vetted — but if you have a specific photographer or florist in mind, confirm they'll be allowed before signing.",
    },
    ...SHARED_END,
  ],
  "makeup-artists": [
    {
      q: "How much does bridal makeup cost?",
      a: "Bridal makeup on Vendora typically runs $250-650 for the bride; bridesmaid and party rates are usually $125-250 per face. Trial sessions are usually $150-250 separately and are strongly recommended.",
    },
    {
      q: "Should I do a makeup trial?",
      a: "Yes — always. The trial lets you align on style, longevity, and skin reaction before the day. Schedule it 4-8 weeks before the event so you can adjust if needed.",
    },
    {
      q: "What's the difference between airbrush and traditional makeup?",
      a: "Airbrush is sprayed on for a smooth, lightweight, photo-friendly finish with high longevity — great for hot or humid events. Traditional (cream/powder) gives more coverage and dimension. Most pros offer both; the artist will recommend based on your skin and the day's conditions.",
    },
    {
      q: "Will the makeup artist travel to the venue?",
      a: "Most will. Travel within the metro area is typically included or charged at a small fee; longer travel may require accommodation reimbursement and an early-call surcharge.",
    },
    ...SHARED_END,
  ],
  videographers: [
    {
      q: "How much does wedding videography cost?",
      a: "Wedding videographers on Vendora typically charge $3,000-9,000 for a same-day-edit highlight plus a long-form film. Premium cinematic packages with multiple shooters, drone, and bespoke editing can exceed $15,000.",
    },
    {
      q: "Should I hire a separate photographer and videographer?",
      a: "Yes — they capture different things, and trying to combine them into one role usually compromises both. Many photo and video teams are studios that coordinate on the day, which is the best of both worlds.",
    },
    {
      q: "What deliverables should I expect?",
      a: "Standard package: a 3-5 minute highlight reel, a 30-60 minute long-form film, raw ceremony coverage, and toasts. Some packages include drone footage, social-media-cut verticals, and a same-day edit screened at the reception.",
    },
    {
      q: "How long until I receive the final video?",
      a: "8-16 weeks is typical. Expedited delivery (4-6 weeks) is sometimes available for an additional fee. The same-day edit, if included, screens during the reception itself.",
    },
    ...SHARED_END,
  ],
  bakers: [
    {
      q: "How much does a wedding cake cost?",
      a: "Wedding cakes on Vendora typically run $8-15 per slice for buttercream and $12-25+ per slice for fondant or sculptural designs. A 100-guest wedding cake usually lands $1,000-2,500; specialty multi-tier sculptural cakes can exceed $5,000.",
    },
    {
      q: "Cake or dessert table?",
      a: "A statement cake gives the room a focal point and a tradition (cake-cutting). A dessert table offers variety and tends to disappear faster. Many couples do both — a smaller display cake for the moment plus a sheet cake or dessert spread for serving.",
    },
    {
      q: "How far in advance should I book a baker?",
      a: "4-6 months before the event. Tastings happen 2-3 months before, with final design lock-in about 4-6 weeks out so the baker can source any specialty ingredients.",
    },
    {
      q: "Can I request specific dietary accommodations?",
      a: "Most professional bakers handle gluten-free, vegan, and nut-free options — confirm at booking. For allergen-strict events, ask whether the kitchen produces in a shared environment.",
    },
    ...SHARED_END,
  ],
  "event-planners": [
    {
      q: "Do I need a planner if my venue has a coordinator?",
      a: "Often yes. A venue coordinator manages the venue's interests (timeline, catering, breakdown). A wedding/event planner manages YOUR interests (vendor coordination, design, run-of-show, problem-solving on the day). They're complementary, not redundant.",
    },
    {
      q: "Full-service vs day-of coordinator — what's the difference?",
      a: "Full-service planners are involved from booking through breakdown — design, vendor sourcing, budget management, the works. Day-of coordinators take over 4-8 weeks before the event to finalize logistics and run the day. Full-service runs $5,000-25,000+; day-of runs $1,500-3,500.",
    },
    {
      q: "When should I hire a planner?",
      a: "Full-service: 12-18 months before the event. Day-of coordinator: 2-4 months before. Hiring a planner before booking the venue is unusual but sometimes useful when you want help defining the vision first.",
    },
    {
      q: "What does a planner actually save me?",
      a: "Time (50-200 hours over the course of planning), money (planners negotiate rates and prevent costly mistakes), and stress on the day. A good planner pays for themselves through vendor savings alone on a mid-to-large event.",
    },
    ...SHARED_END,
  ],
  decorators: [
    {
      q: "What does a decorator do beyond florals?",
      a: "Decorators handle the full visual layer — linens, lighting design, signage, draping, custom installations, place settings, and any specialty furniture. Many also coordinate with rental companies and your florist on color and texture.",
    },
    {
      q: "How much should I budget for event decor?",
      a: "Decor (excluding florals) typically runs 5-12% of the event budget. For a $80,000 wedding, that's roughly $4,000-9,500 spent on lighting, linens, signage, and styling — though large installations or sculptural builds can push it higher.",
    },
    {
      q: "Do I need a decorator if I have a planner and florist?",
      a: "Sometimes the planner and florist together can cover styling. For events with a strong design concept, custom builds, or specialty lighting, a dedicated decorator brings depth that splits naturally from those roles.",
    },
    {
      q: "When should I book a decorator?",
      a: "5-9 months before the event. Custom fabrications and rental holds need lead time; lighting plots are usually finalized 4-6 weeks out.",
    },
    ...SHARED_END,
  ],
};

// Generic FAQs for city-only landing pages.
export const CITY_FAQS = (city: string): FaqItem[] => [
  {
    q: `How do I find vendors in ${city} on Vendora?`,
    a: `Browse the directory and filter by location, or use this page to see only vendors based in or near ${city}. Each profile shows pricing, packages, real reviews, and direct messaging — no calls or chasing required.`,
  },
  {
    q: `Are ${city} vendors on Vendora vetted?`,
    a: `Yes. Every vendor is hand-reviewed by our editorial team for portfolio quality, references, and professional standing before being approved to list — regardless of city.`,
  },
  {
    q: `What types of events do ${city} vendors handle?`,
    a: `Weddings, milestone birthdays, holiday gatherings, baby showers, anniversaries, corporate events, and intimate dinners. Use the category filters to narrow down by what you're planning.`,
  },
  {
    q: `How early should I book vendors in ${city}?`,
    a: `Peak-season vendors (May-October weddings, December holiday events) often book 9-12 months out. For smaller gatherings or off-peak dates, 6-8 weeks is typically enough — though the most in-demand venues and photographers book earlier.`,
  },
  {
    q: `Is there a booking fee?`,
    a: `Browsing and contacting vendors is free for hosts. You pay each vendor directly through Vendora's secure messaging and proposal flow — we don't add markups to vendor pricing.`,
  },
];
