import { toast } from "sonner";

// Shape returned by every credit-metered edge function when the
// vendor's balance can't cover the action — matches
// _shared/credits.ts::insufficientCreditsResponse on the server.
interface InsufficientCreditsBody {
  error: "insufficient_credits";
  cost: number;
  message?: string;
}

// Inspects a Supabase `functions.invoke` error to see if it's a 402
// insufficient_credits response. If yes: pops a toast with a "Top up"
// CTA that takes the vendor to /vendor/subscription, then returns
// true so the caller knows to skip its generic error toast.
//
// Usage:
//   } catch (err) {
//     if (await handleInsufficientCredits(err, navigate)) return;
//     toast.error("Couldn't generate."); // generic fallback
//   }
export async function handleInsufficientCredits(
  err: unknown,
  navigate: (path: string) => void,
): Promise<boolean> {
  // FunctionsHttpError stashes the raw Response on .context so we
  // can re-parse the JSON body. There's only ONE shot at the body
  // (it's a one-shot stream), so if a caller calls this they must
  // not also try to read ctx.json themselves.
  const ctx = (err as { context?: Response })?.context;
  if (!ctx || typeof ctx.json !== "function") return false;

  let body: InsufficientCreditsBody | null = null;
  try {
    body = (await ctx.json()) as InsufficientCreditsBody;
  } catch {
    return false;
  }
  if (body?.error !== "insufficient_credits") return false;

  const cost = typeof body.cost === "number" ? body.cost : null;
  toast.error(
    cost
      ? `Out of credits — this action needed ${cost} credit${cost === 1 ? "" : "s"}.`
      : "Out of credits.",
    {
      description:
        "Top up a credit pack or upgrade your plan to keep using HILUX and Axion.",
      action: {
        label: "Top up",
        onClick: () => navigate("/vendor/subscription"),
      },
      duration: 8000,
    },
  );
  return true;
}
