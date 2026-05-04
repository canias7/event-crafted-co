import { supabase } from "@/integrations/supabase/client";

// Frontend helpers for the Google Calendar OAuth flow. The actual
// secrets and OAuth dance happen in the google-calendar-oauth edge
// function — these wrappers handle calling it and shaping responses.

export interface CalendarConnection {
  id: string;
  provider: "google";
  account_email: string | null;
  pull_busy_times: boolean;
  push_appointments: boolean;
  last_synced_at: string | null;
  last_sync_error: string | null;
  token_expires_at: string;
  created_at: string;
}

// Fetch the current user's connections (just one for now — we only
// support Google).
export async function loadCalendarConnections(): Promise<CalendarConnection[]> {
  const { data, error } = await supabase
    .from("calendar_connections")
    .select(
      "id, provider, account_email, pull_busy_times, push_appointments, last_synced_at, last_sync_error, token_expires_at, created_at",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as CalendarConnection[]) ?? [];
}

// Initiate the OAuth flow. Calls the edge function to get a Google
// authorize URL with a signed state token, then redirects the browser
// there. After consent, Google redirects to the callback edge function
// which handles the code exchange and finally redirects back to
// /settings?calendar=connected.
export async function startGoogleConnect(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  const { data, error } = await supabase.functions.invoke(
    "google-calendar-oauth?action=authorize",
    { method: "POST" },
  );
  if (error) {
    return { ok: false, reason: error.message };
  }
  const url = (data as { url?: string })?.url;
  if (!url) return { ok: false, reason: "no auth url returned" };
  window.location.href = url;
  return { ok: true };
}

export async function disconnectCalendar(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  const { error } = await supabase.functions.invoke(
    "google-calendar-oauth?action=disconnect",
    { method: "POST" },
  );
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

// Trigger a one-off sync (post-connect, or "Sync now" button).
export async function triggerSync(userId?: string): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  const { error } = await supabase.functions.invoke(
    "sync-google-calendar",
    { body: userId ? { user_id: userId } : {} },
  );
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

// Toggle pull_busy_times / push_appointments preferences.
export async function updateCalendarPreference(
  id: string,
  patch: Partial<Pick<CalendarConnection, "pull_busy_times" | "push_appointments">>,
): Promise<void> {
  const { error } = await supabase
    .from("calendar_connections")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}
