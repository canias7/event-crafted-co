// Retired. The vendor bulk-import flow has been removed along with its
// "You've been invited to Vendora" email (the only caller of GoTrue's
// inviteUserByEmail). This endpoint now returns 410 Gone.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

serve(() =>
  new Response(
    JSON.stringify({ error: "gone", message: "Vendor bulk-import has been retired." }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  )
);
