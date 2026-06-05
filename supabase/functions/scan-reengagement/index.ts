// Retired. The past-client re-engagement nudge (and its
// reengagement_opportunity email) has been removed. The daily cron
// 'scan-reengagement-daily' is being unscheduled; this endpoint now
// returns 410 Gone.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

serve(() =>
  new Response(
    JSON.stringify({ error: "gone", message: "Re-engagement scanning has been retired." }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  )
);
