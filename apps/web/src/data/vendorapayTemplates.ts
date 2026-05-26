// Starter templates for VendoraPay's Files surface. These are
// hand-written first drafts that vendors can pick to skip the
// blank-page problem; eventually an AI builder will generate them
// from a short prompt. Until then, picking a template prefills the
// invoice composer (Invoices) or opens a preview that the vendor
// can copy from (Contracts, Proposals).

/**
 * Visual style for the invoice. Each template ships with a distinct
 * design so vendors can pick the one that matches their brand.
 *
 * - editorial  — serif title, generous whitespace, warm peach accent
 * - bold       — full-bleed dark header with the total inverted on it
 * - minimal    — hairline rules, no color, all-cap headings
 * - colorblock — accented sidebar column with the bill-to + meta block
 * - modern     — sans-serif, monoline typography, blue accent bar
 */
export type InvoiceStyle =
  | "editorial"
  | "bold"
  | "minimal"
  | "colorblock"
  | "modern";

export interface InvoiceTemplate {
  id: string;
  title: string;
  category: string;
  summary: string;
  style: InvoiceStyle;
  /** Suggested tax percentage to prefill (e.g. 7.25 for 7.25%). */
  taxPct: number;
  /** Notes / scope summary shown above the payment terms block. */
  notes: string;
  /**
   * Subject / project line shown between the meta block and the
   * line-item table — gives the invoice context at a glance
   * ("[Couple Names] Wedding", "Annual Gala 2026", etc).
   */
  projectTitle: string;
  /**
   * Payment schedule, accepted methods, and late-fee policy.
   * Surfaced as a dedicated block under the totals so it reads
   * as policy rather than a freeform note.
   */
  paymentTerms: string;
  lineItems: Array<{
    name: string;
    /** Short subtext that gives the line item more context. */
    description?: string;
    qty: number;
    /** Unit price in dollars (not cents) — converted by the composer. */
    price: number;
  }>;
}

export interface DocTemplate {
  id: string;
  title: string;
  category: string;
  summary: string;
  /** Markdown-style plain text; rendered as monospace pre in preview. */
  content: string;
}

// -- Invoices --------------------------------------------------------

export const INVOICE_TEMPLATES: InvoiceTemplate[] = [
  {
    id: "wedding-photography",
    title: "Wedding Photography — Full Day",
    category: "Photography",
    summary: "8 hours of coverage, second shooter, edited gallery, engagement session.",
    style: "editorial",
    projectTitle: "[Couple Names] · Wedding photography",
    taxPct: 7.25,
    notes:
      "Edited gallery delivered within 6 weeks via online proofing. A 10-image sneak peek arrives within 72 hours of the event. Pricing assumes one continuous coverage window.",
    paymentTerms:
      "50% non-refundable retainer due to reserve the date. Balance due 14 days before the event. Card and bank transfer accepted; a 3% surcharge applies to balances paid more than 14 days past due.",
    lineItems: [
      {
        name: "Wedding day photography (8 hours)",
        description: "Lead photographer · ceremony through reception · candid + posed coverage",
        qty: 1,
        price: 3500,
      },
      {
        name: "Second photographer",
        description: "8 hours of bridal-party, reception, and detail coverage",
        qty: 1,
        price: 800,
      },
      {
        name: "Engagement session (1 hour)",
        description: "Location of your choice · 30-minute pre-shoot consultation included",
        qty: 1,
        price: 400,
      },
      {
        name: "Edited digital gallery",
        description: "400+ retouched images via password-protected online gallery",
        qty: 1,
        price: 0,
      },
      {
        name: "Print release & sneak peek",
        description: "Personal print rights + 10-image teaser delivered within 72 hours",
        qty: 1,
        price: 0,
      },
    ],
  },
  {
    id: "dj-lighting",
    title: "DJ + Lighting Setup",
    category: "Entertainment",
    summary: "6 hours of DJ, uplighting, dance floor wash, wireless mics.",
    style: "bold",
    projectTitle: "[Event Name] · DJ services + lighting",
    taxPct: 7.25,
    notes:
      "Includes a 60-minute music timeline planning call scheduled 30 days before the event. Backup decks, controller, and speakers on hand for redundancy.",
    paymentTerms:
      "50% deposit secures the date. Balance due 7 days before the event. Cancellations within 30 days forfeit 50% of the balance.",
    lineItems: [
      {
        name: "DJ services (6 hours)",
        description: "Cocktail hour through last dance · MC and announcements included",
        qty: 1,
        price: 1500,
      },
      {
        name: "Uplighting (12 fixtures)",
        description: "Wireless RGB fixtures · color-matched to your event palette",
        qty: 1,
        price: 400,
      },
      {
        name: "Dance floor wash",
        description: "Programmed lighting pattern over the dance floor",
        qty: 1,
        price: 250,
      },
      {
        name: "Wireless microphones",
        description: "Handheld or lavalier · for toasts, ceremony, announcements",
        qty: 2,
        price: 50,
      },
      {
        name: "Setup & breakdown",
        description: "90-minute pre-event setup · full breakdown post-event",
        qty: 1,
        price: 200,
      },
    ],
  },
  {
    id: "catering-plated",
    title: "Plated Dinner — 75 Guests",
    category: "Catering",
    summary: "3-course plated dinner, passed apps, full service staff and bar.",
    style: "colorblock",
    projectTitle: "[Event Name] · Plated dinner service",
    taxPct: 8.0,
    notes:
      "Final headcount and menu confirmation due 7 days before the event. Dietary accommodations honored with 14 days' notice. Pricing assumes one venue and one delivery window.",
    paymentTerms:
      "25% non-refundable deposit at signing. 50% due 60 days before the event. Balance plus any overages due day of the event. A 20% service charge is included in line pricing.",
    lineItems: [
      {
        name: "Plated dinner per guest",
        description: "Three courses · choice of two entrées including one vegetarian",
        qty: 75,
        price: 85,
      },
      {
        name: "Passed appetizers (4 selections)",
        description: "75-minute cocktail-hour service · chef's seasonal selection",
        qty: 75,
        price: 18,
      },
      {
        name: "Tableware",
        description: "China, glassware, flatware per guest · linen rentals included",
        qty: 75,
        price: 12,
      },
      {
        name: "Service staff (5 staff, 6 hours)",
        description: "Captain, four servers, busser · setup through guest departure",
        qty: 1,
        price: 1200,
      },
      {
        name: "Open bar (4 hours)",
        description: "Beer, wine, signature cocktail · two bartenders included",
        qty: 1,
        price: 1800,
      },
    ],
  },
  {
    id: "florals-wedding",
    title: "Wedding Florals & Installation",
    category: "Florals",
    summary: "Bridal party flowers, centerpieces, ceremony arch installation.",
    style: "minimal",
    projectTitle: "[Couple Names] · Wedding florals & install",
    taxPct: 7.25,
    notes:
      "Final flower selections locked 30 days before the event subject to seasonal availability. Pricing assumes one delivery and one teardown. Additional drives billed at $75 each.",
    paymentTerms:
      "Non-refundable retainer of $500 due at booking. 50% balance due 30 days before. Final balance due day of installation.",
    lineItems: [
      {
        name: "Bridal bouquet (premium)",
        description: "Garden roses, peonies, seasonal accent flora · hand-tied with silk ribbon",
        qty: 1,
        price: 350,
      },
      {
        name: "Bridesmaid bouquets",
        description: "Coordinated palette · slightly smaller scale than bridal bouquet",
        qty: 5,
        price: 95,
      },
      {
        name: "Boutonnieres & corsages",
        description: "Wired stems · satin ribbon · pin or wrist-mount as required",
        qty: 8,
        price: 35,
      },
      {
        name: "Ceremony arch florals",
        description: "Asymmetric installation · install and strike included",
        qty: 1,
        price: 850,
      },
      {
        name: "Reception centerpieces",
        description: "Low arrangements · taper candles · footed bowl rentals included",
        qty: 12,
        price: 125,
      },
    ],
  },
  {
    id: "day-of-coordination",
    title: "Day-of Coordination — Premium",
    category: "Planning",
    summary: "8 hours of day-of management, vendor liaison, timeline execution.",
    style: "modern",
    projectTitle: "[Couple Names] · Day-of coordination",
    taxPct: 0,
    notes:
      "Includes one venue walkthrough 30 days before the event and three pre-event planning calls. Final timeline distributed to all vendors 7 days out.",
    paymentTerms:
      "Flat-fee package. 25% non-refundable deposit to secure the date. Balance due 14 days before the event. No additional charges for overtime up to 30 minutes past contracted end time.",
    lineItems: [
      {
        name: "Lead coordinator (8 hours)",
        description: "Vendor liaison, timeline execution, on-site emergency response",
        qty: 1,
        price: 1800,
      },
      {
        name: "Assistant coordinator",
        description: "Supports the lead, manages secondary touchpoints and runner duties",
        qty: 1,
        price: 600,
      },
      {
        name: "Pre-event planning calls",
        description: "Three 60-minute calls within the 60 days before the event",
        qty: 3,
        price: 100,
      },
      {
        name: "Vendor liaison & timeline build",
        description: "Master timeline shared with all vendors 7 days before the event",
        qty: 1,
        price: 400,
      },
      {
        name: "Day-of emergency kit",
        description: "Stain remover, sewing kit, scissors, safety pins, snacks — on-site",
        qty: 1,
        price: 0,
      },
    ],
  },
];

// -- Contracts -------------------------------------------------------

export const CONTRACT_TEMPLATES: DocTemplate[] = [
  {
    id: "standard-service",
    title: "Standard Service Agreement",
    category: "General",
    summary: "Generic services agreement covering scope, payment, cancellation, and liability.",
    content: `# Service Agreement

This Service Agreement ("Agreement") is entered into between [Vendor Name] ("Vendor") and [Client Name] ("Client") for services to be performed on [Event Date].

## 1. Services
Vendor agrees to provide the services described in the attached invoice or proposal. Any changes to scope must be agreed in writing.

## 2. Payment
A non-refundable deposit of 50% is due at signing to reserve the date. The remaining balance is due 14 days before the event.

## 3. Cancellation
- More than 60 days before the event: deposit retained, no further charges.
- 30 to 60 days before the event: 50% of total due.
- Less than 30 days: full balance due.

## 4. Force Majeure
Neither party is liable for failure to perform due to events beyond their reasonable control (natural disasters, government orders, etc).

## 5. Liability
Vendor's liability is limited to the amount paid under this Agreement.

## 6. Signatures
Vendor: ____________________  Date: __________
Client: ____________________  Date: __________`,
  },
  {
    id: "wedding-photography",
    title: "Wedding Photography Agreement",
    category: "Photography",
    summary: "Hours, deliverables, copyright, and payment schedule for wedding photographers.",
    content: `# Wedding Photography Agreement

This Agreement is between [Photographer] and [Client(s)] for wedding photography services on [Date] at [Venue].

## Services
- [X] hours of continuous coverage starting at [Time]
- [Number] of edited digital images delivered within [X] weeks
- Online gallery for download and sharing
- Print release for personal use

## Payment Schedule
- 30% deposit due at signing
- 30% due 90 days before the event
- 40% balance due 14 days before the event

## Image Delivery
Edited images will be delivered via online gallery within [X] weeks. RAW files are not included.

## Copyright
Photographer retains copyright. Client receives a personal print release. Commercial use requires separate licensing.

## Cancellation
Deposit is non-refundable. If Photographer must cancel due to emergency, a replacement of equal skill will be provided or a full refund issued.

## Acceptance
By signing below, both parties agree to these terms.

Photographer: ____________________
Client: ____________________
Date: __________`,
  },
  {
    id: "venue-rental",
    title: "Venue Rental Agreement",
    category: "Venue",
    summary: "Access hours, capacity, house rules, insurance requirements, and damage deposit.",
    content: `# Venue Rental Agreement

This Agreement is between [Venue Owner] ("Venue") and [Client] for use of [Venue Name] on [Date].

## Rental Period
Access from [Start Time] to [End Time]. Setup and breakdown must be completed within this window.

## Capacity
Maximum [Number] guests. Client is responsible for staying within capacity.

## Fees
- Rental fee: $[Amount]
- Refundable damage deposit: $[Amount]
- Cleaning fee: $[Amount]

## House Rules
- No open flames except in designated areas
- Amplified music must end by [Time]
- All decorations must be removed at the end of rental
- Vendor load-in/out through [Designated Entrance] only

## Insurance
Client must provide proof of $1M liability insurance naming Venue as additional insured at least 14 days before the event.

## Cancellation
- More than 90 days out: full refund less $[Fee].
- Within 90 days: deposit forfeited.

Venue: ____________________
Client: ____________________
Date: __________`,
  },
  {
    id: "catering-service",
    title: "Catering Service Contract",
    category: "Catering",
    summary: "Menu, headcount guarantees, service hours, dietary accommodations, and leftovers.",
    content: `# Catering Service Agreement

This Agreement is between [Caterer] and [Client] for catering services on [Date] at [Venue].

## Menu
Menu as agreed in the attached proposal. Final menu confirmation due 30 days before event.

## Guest Count
- Estimated guest count: [Number]
- Final guaranteed headcount due [X] days before the event
- Charges based on the final guarantee or actual attendance, whichever is greater

## Service
- Setup begins [X] hours before the event
- Service for [X] hours
- Breakdown and cleanup included

## Payment
- 25% non-refundable deposit due at signing
- 50% due 60 days before the event
- 25% balance plus any overages due day of the event

## Dietary Accommodations
Caterer will accommodate dietary restrictions communicated at least [X] days in advance.

## Leftovers
Per local health code, leftover food may not be sent home with guests but may be donated.

Caterer: ____________________
Client: ____________________
Date: __________`,
  },
  {
    id: "cancellation-policy",
    title: "Cancellation & Refund Policy",
    category: "Policy",
    summary: "Tiered refund schedule, date changes, force majeure, and vendor-side cancellation.",
    content: `# Cancellation & Refund Policy

This Policy applies to all bookings with [Vendor Name] ("Vendor").

## Deposit
A non-refundable deposit of [%] is required to secure the booking. The deposit reserves your date and is forfeited upon cancellation, regardless of timing.

## Cancellation Schedule
- More than 90 days before the event: full refund of payments beyond the deposit
- 60 to 90 days before the event: 50% refund of payments beyond the deposit
- 30 to 59 days before the event: 25% refund of payments beyond the deposit
- Less than 30 days: no refund

## Date Changes
One date change permitted at no additional cost, subject to Vendor's availability. Additional changes incur a $[Fee] administrative fee.

## Force Majeure
If the event cannot proceed due to circumstances beyond either party's control (pandemic, natural disaster, government order), Vendor will work in good faith to reschedule. Refunds are not guaranteed in force majeure events.

## Vendor Cancellation
If Vendor must cancel for any reason, Client receives a full refund of all amounts paid, including the deposit. Vendor will assist in finding a comparable replacement when possible.

Acknowledged:
Client: ____________________
Date: __________`,
  },
];

// -- Proposals -------------------------------------------------------

export const PROPOSAL_TEMPLATES: DocTemplate[] = [
  {
    id: "full-wedding",
    title: "Full Wedding Production",
    category: "Wedding",
    summary: "Photo + video + drone package with engagement session and full timeline planning.",
    content: `# Wedding Production Proposal — [Client Names]

Thank you for considering us to be part of your wedding day. Below is our recommended package for [Wedding Date] at [Venue].

## Coverage Overview
A full-production team covering every moment from getting-ready through last dance.

## What's Included
- 10 hours of photography coverage (lead + second shooter)
- 6 hours of videography (cinematic edit + ceremony cut)
- Drone aerial shots (weather permitting)
- Online proofing gallery + film delivery on USB
- Engagement session (1 hour) at the location of your choice
- Pre-wedding consult and timeline planning

## Investment
- Photography package: $[Amount]
- Videography package: $[Amount]
- Drone coverage: $[Amount]
- Engagement session: included
- **Total: $[Amount]**

## Payment Plan
- $[Amount] deposit to secure the date
- $[Amount] due 90 days before
- $[Amount] balance due 14 days before

## Next Steps
If this looks right, sign the attached contract and submit the deposit to lock in [Date]. Questions? Just reply to this proposal.

Looking forward,
[Your Name]`,
  },
  {
    id: "corporate-event",
    title: "Corporate Event Coverage",
    category: "Corporate",
    summary: "Photo + recap reel + speaker headshots scoped for marketing and internal comms.",
    content: `# Corporate Event Coverage Proposal

Prepared for: [Company Name]
Event: [Event Title]
Date: [Date]

## Scope
Comprehensive coverage of your [event type] designed for use in post-event marketing, internal comms, and recap content.

## Deliverables
- 4 hours of on-site photography
- 2 hours of social-ready video clips
- 30-second event recap reel
- 150+ edited photos delivered within 5 business days
- Brand-aligned color grading
- Full usage rights for marketing and internal use

## Add-Ons (Optional)
- Speaker headshots: $[Amount]
- Live-event social posting: $[Amount]
- Extended coverage (per hour): $[Amount]

## Investment
- Base package: $[Amount]
- With selected add-ons: $[Amount]

## Timeline
- Proposal acceptance: by [Date]
- 50% deposit: due at acceptance
- Final brief call: [Date]
- Deliverables: within 5 business days post-event

[Your Name]`,
  },
  {
    id: "birthday-party",
    title: "Birthday Celebration Package",
    category: "Private Events",
    summary: "Coordination, décor, photography, and music planning for milestone birthdays.",
    content: `# Birthday Celebration Package — [Honoree Name]

Hi [Client]!

So excited to help make [Honoree]'s [Age]th birthday unforgettable. Here's what we're proposing:

## The Vibe
[Theme or style description — e.g. "a sophisticated dinner party with playful touches"]

## What's Included
- 4 hours of event coordination
- Custom décor setup (balloons, signage, table styling)
- Photography (2 hours of coverage, 75+ edited photos)
- Music playlist curation
- Day-of timeline management

## Investment
- Coordination & styling: $[Amount]
- Photography add-on: $[Amount]
- Décor & materials: $[Amount]
- **Total: $[Amount]**

## Payment
- 30% to book
- 70% balance due one week before

[Your Name]`,
  },
  {
    id: "dj-photo-bundle",
    title: "DJ + Photography Bundle",
    category: "Bundle",
    summary: "Combined music and photo coverage with bundle discount and add-on options.",
    content: `# DJ + Photography Bundle Proposal

For: [Client Name]
Event: [Event Type]
Date: [Date]

## Why Bundle?
One team, one timeline, one point of contact — less stress for you and tighter sync between the music moments and the visual story.

## DJ Services
- 6 hours of DJ services
- Cocktail hour through last dance
- Wireless mic for toasts
- Custom song selection and announcements

## Photography
- 6 hours of coverage (matches the DJ window)
- 250+ edited photos
- Online gallery with download + print release
- Sneak peek images within 48 hours

## Bundle Pricing
- Individual total: $[Amount]
- **Bundle price: $[Amount] (save $[Amount])**

## Payment
- $[Amount] to reserve the date
- $[Amount] balance due 14 days out

## Add-Ons
- Uplighting: $[Amount]
- Photo booth: $[Amount]
- Extended coverage (per hour): $[Amount]

[Your Name]`,
  },
  {
    id: "catering-tasting",
    title: "Catering Tasting Proposal",
    category: "Catering",
    summary: "Cocktail hour, plated dinner, dessert station, with tasting included on booking.",
    content: `# Catering Proposal — [Event Name]

Thanks for considering us for [Event Date]. Based on our conversation, here's a recommended menu for your [Guest Count]-guest [event type].

## Cocktail Hour
- Choice of 4 passed hors d'oeuvres
- Charcuterie display
- Open bar (beer, wine, signature cocktail)

## Plated Dinner
- Choice of seasonal salad
- Two entrée options (one vegetarian)
- Family-style sides
- Wedding cake service (cake by client)

## Dessert
- Late-night dessert station
- Coffee, tea, espresso bar

## Service
- Setup and breakdown
- 5 service staff for 6 hours
- 2 bartenders
- All tableware, linens, glassware

## Investment
- Food per guest: $[Amount] × [Guest Count] = $[Subtotal]
- Bar package: $[Amount]
- Service & rentals: $[Amount]
- **Subtotal: $[Amount]**
- Tax & service charge: $[Amount]
- **Total: $[Amount]**

## Next Steps
- Schedule a tasting (included with booking)
- 25% deposit to secure the date
- Final menu locked 30 days before event

[Your Name]`,
  },
];
