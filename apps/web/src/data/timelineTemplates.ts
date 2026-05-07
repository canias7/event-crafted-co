// Day-of timeline templates per event type. Hosts click "Use this
// template" to seed their event_timeline_items. Times are placeholder
// guides — the app converts them into rows the host can edit/reorder/
// delete after applying.

export interface TimelineTemplateItem {
  time: string;       // HH:MM 24h
  title: string;
  notes?: string;
}

export interface TimelineTemplate {
  event_type: string;
  label: string;
  description: string;
  items: TimelineTemplateItem[];
}

export const TIMELINE_TEMPLATES: TimelineTemplate[] = [
  {
    event_type: "wedding",
    label: "Classic afternoon wedding",
    description: "Ceremony at 4pm, dinner at 6, dancing till close.",
    items: [
      { time: "14:00", title: "Vendor arrival + setup" },
      { time: "15:00", title: "Photographer first looks" },
      { time: "16:00", title: "Ceremony" },
      { time: "16:45", title: "Cocktail hour", notes: "Family photos parallel" },
      { time: "18:00", title: "Reception entrance + first dance" },
      { time: "18:30", title: "Dinner served" },
      { time: "19:30", title: "Toasts" },
      { time: "20:00", title: "Cake cutting" },
      { time: "20:15", title: "Dancing opens" },
      { time: "23:00", title: "Last call" },
      { time: "23:30", title: "Send-off" },
    ],
  },
  {
    event_type: "wedding",
    label: "Evening wedding",
    description: "Sunset ceremony, late reception.",
    items: [
      { time: "16:00", title: "Vendor arrival + setup" },
      { time: "17:30", title: "Photographer first looks" },
      { time: "18:30", title: "Ceremony" },
      { time: "19:00", title: "Cocktail hour" },
      { time: "20:00", title: "Reception entrance" },
      { time: "20:30", title: "Dinner" },
      { time: "21:30", title: "Toasts + first dance" },
      { time: "22:00", title: "Dancing" },
      { time: "00:30", title: "Send-off" },
    ],
  },
  {
    event_type: "birthday",
    label: "Milestone birthday party",
    description: "Cocktail-hour-style with dinner + dancing.",
    items: [
      { time: "17:00", title: "Vendor setup" },
      { time: "18:30", title: "Guests arrive · cocktails" },
      { time: "19:30", title: "Welcome toast" },
      { time: "19:45", title: "Dinner" },
      { time: "21:00", title: "Cake + speeches" },
      { time: "21:30", title: "Dancing" },
      { time: "23:30", title: "Wind down" },
    ],
  },
  {
    event_type: "baby_shower",
    label: "Afternoon baby shower",
    description: "Brunch-style with games + gift opening.",
    items: [
      { time: "11:00", title: "Vendor setup" },
      { time: "12:00", title: "Guests arrive · drinks" },
      { time: "12:30", title: "Brunch served" },
      { time: "13:30", title: "Games + activities" },
      { time: "14:30", title: "Gift opening" },
      { time: "15:30", title: "Cake + farewells" },
    ],
  },
  {
    event_type: "holiday_dinner",
    label: "Holiday dinner",
    description: "Family-style holiday gathering.",
    items: [
      { time: "16:00", title: "Caterer + decor setup" },
      { time: "17:30", title: "Guests arrive · appetizers" },
      { time: "18:30", title: "Dinner served" },
      { time: "20:00", title: "Dessert + coffee" },
      { time: "21:30", title: "Farewells" },
    ],
  },
  {
    event_type: "anniversary",
    label: "Anniversary dinner",
    description: "Intimate dinner with a few speeches.",
    items: [
      { time: "17:30", title: "Setup" },
      { time: "18:30", title: "Cocktails" },
      { time: "19:30", title: "Dinner" },
      { time: "20:30", title: "Toasts + cake" },
      { time: "21:30", title: "Wind down" },
    ],
  },
  {
    event_type: "corporate",
    label: "Evening corporate gala",
    description: "Welcome reception + program + dinner.",
    items: [
      { time: "16:00", title: "AV + setup" },
      { time: "18:00", title: "Welcome reception" },
      { time: "19:00", title: "Program · speakers" },
      { time: "20:00", title: "Dinner" },
      { time: "21:30", title: "Awards or toasts" },
      { time: "22:30", title: "Networking" },
    ],
  },
];

export function templatesForEventType(eventType: string | null) {
  if (!eventType) return [];
  return TIMELINE_TEMPLATES.filter((t) => t.event_type === eventType);
}
