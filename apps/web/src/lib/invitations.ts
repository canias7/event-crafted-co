// Shared shapes for customizable invitations (owner's call, Oct 2026).
// The host sets these on host_events (InvitationDialog); the public RSVP
// page reads them through get_event_by_share_token.

export type InviteStyle = "classic" | "evening" | "photo";
export const INVITE_STYLES: InviteStyle[] = ["classic", "evening", "photo"];

export interface InviteQuestion {
  id: string;
  label: string;
}

export const MAX_QUESTIONS = 5;
export const MAX_MEAL_OPTIONS = 8;
export const MAX_PLUS_ONES = 5;

// The public payload from get_event_by_share_token.
export interface PublicInvite {
  id: string;
  title: string;
  event_type: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  notes: string | null;
  invite_style: InviteStyle;
  invite_cover_url: string | null;
  invite_message: string | null;
  // Colours, lettering and decoration (lib/inviteDesign.ts reads it).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invite_design: any;
  rsvp_deadline: string | null;
  closed: boolean;
  plus_ones_max: number;
  meal_options: string[];
  ask_dietary: boolean;
  ask_song: boolean;
  questions: InviteQuestion[];
  show_counts: boolean;
  going_count: number | null;
  maybe_count: number | null;
  spots_left: number | null;
}

// The function used to return table rows; read either shape so the page
// works while the database and the site update.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readInvitePayload(data: any): PublicInvite | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.id) return null;
  return {
    invite_style: "classic",
    invite_cover_url: null,
    invite_message: null,
    invite_design: null,
    rsvp_deadline: null,
    closed: false,
    plus_ones_max: 0,
    meal_options: [],
    ask_dietary: false,
    ask_song: false,
    questions: [],
    show_counts: true,
    spots_left: null,
    ...row,
  } as PublicInvite;
}
