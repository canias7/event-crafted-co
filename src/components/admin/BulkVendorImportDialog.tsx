import { useMemo, useState } from "react";
import { Loader2, Upload, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Bulk vendor importer for admins. Paste a CSV with the columns:
//
//   email,business_name,category,location,base_price,bio
//
// First row is the header. We parse client-side, preview the parsed rows,
// then POST to admin-bulk-import-vendors which (1) invites each user via
// Supabase auth, (2) ensures their profiles row + vendor role, (3) creates
// a vendor_profiles skeleton — all server-side via service-role key.

interface ImportRow {
  email: string;
  business_name: string;
  category: string;
  location?: string;
  base_price_cents?: number;
  bio?: string;
  // Tracked client-side for the preview only.
  __error?: string;
}

interface RowResult {
  email: string;
  ok: boolean;
  vendor_id?: string;
  reason?: string;
  status?: "invited" | "existing";
}

const TEMPLATE = `email,business_name,category,location,base_price,bio
sarah@example.com,"Bloom & Vine",Florist,"Brooklyn, NY",2500,"Editorial florals for weddings and intimate dinners."
marcus@example.com,"Marcus Lin Photography",Photographer,"Manhattan, NY",4500,"Documentary wedding photography."`;

// Lightweight CSV parser — handles quoted fields with commas inside.
// Not RFC 4180 perfect (no escaped quotes), but enough for an admin
// paste flow.
function parseCsv(text: string): ImportRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  const idx = (k: string) => header.indexOf(k);

  const out: ImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row: ImportRow = {
      email: (cols[idx("email")] ?? "").trim(),
      business_name: (cols[idx("business_name")] ?? "").trim(),
      category: (cols[idx("category")] ?? "").trim(),
      location: (cols[idx("location")] ?? "").trim() || undefined,
      bio: (cols[idx("bio")] ?? "").trim() || undefined,
    };
    const priceRaw = (cols[idx("base_price")] ?? "").trim();
    if (priceRaw) {
      const cents = Math.round(Number(priceRaw) * 100);
      if (Number.isFinite(cents) && cents >= 0) row.base_price_cents = cents;
      else row.__error = `Invalid price: "${priceRaw}"`;
    }
    if (!row.email || !row.email.includes("@")) {
      row.__error = "Missing or invalid email";
    } else if (!row.business_name) {
      row.__error = "Missing business_name";
    } else if (!row.category) {
      row.__error = "Missing category";
    }
    out.push(row);
  }
  return out;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === "," && !inQuotes) {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += c;
  }
  out.push(buf);
  return out;
}

export function BulkVendorImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImported: () => void;
}) {
  const [csv, setCsv] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<RowResult[] | null>(null);

  const parsed = useMemo(() => parseCsv(csv), [csv]);
  const valid = parsed.filter((r) => !r.__error);
  const invalid = parsed.length - valid.length;

  async function submit() {
    if (valid.length === 0) {
      toast.error("No valid rows to import");
      return;
    }
    setSubmitting(true);
    setResults(null);
    const { data, error } = await supabase.functions.invoke(
      "admin-bulk-import-vendors",
      {
        body: {
          rows: valid.map(({ __error: _err, ...r }) => r),
        },
      },
    );
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const res = data as { results: RowResult[]; succeeded: number; total: number };
    setResults(res.results);
    toast.success(`${res.succeeded}/${res.total} vendors imported`);
    if (res.succeeded > 0) onImported();
  }

  function reset() {
    setCsv("");
    setResults(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Bulk import vendors
          </DialogTitle>
          <DialogDescription>
            Paste a CSV. Each row gets a Supabase invite email + a
            vendor_profiles skeleton so the marketplace surfaces them
            immediately. Vendors confirm via the invite link to take
            over their profile.
          </DialogDescription>
        </DialogHeader>

        {!results ? (
          <div className="space-y-4 pt-2">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="bulk-csv">CSV</Label>
                <button
                  type="button"
                  className="text-xs text-accent hover:underline"
                  onClick={() => setCsv(TEMPLATE)}
                >
                  Insert template
                </button>
              </div>
              <Textarea
                id="bulk-csv"
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                rows={10}
                placeholder="email,business_name,category,location,base_price,bio"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Required: email, business_name, category. Optional:
                location, base_price (USD), bio. Max 200 rows per import.
              </p>
            </div>

            {parsed.length > 0 && (
              <div className="rounded-sm border border-border bg-card overflow-hidden">
                <div className="px-3 py-2 border-b border-border bg-secondary/40 text-xs flex items-center justify-between">
                  <span>
                    Preview · <strong>{valid.length}</strong> valid
                    {invalid > 0 && (
                      <>
                        {" · "}
                        <span className="text-destructive">
                          <strong>{invalid}</strong> with errors
                        </span>
                      </>
                    )}
                  </span>
                </div>
                <ul className="max-h-60 overflow-y-auto divide-y divide-border">
                  {parsed.map((r, i) => (
                    <li
                      key={i}
                      className={`px-3 py-2 text-xs ${
                        r.__error ? "bg-destructive/5" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {r.__error ? (
                          <AlertCircle className="w-3.5 h-3.5 mt-0.5 text-destructive shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-accent shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">
                            {r.business_name || "(missing name)"}
                          </p>
                          <p className="text-muted-foreground text-[11px] truncate">
                            {r.email || "(missing email)"} ·{" "}
                            {r.category || "(missing category)"}
                            {r.location && ` · ${r.location}`}
                          </p>
                          {r.__error && (
                            <p className="text-destructive text-[11px] mt-0.5">
                              {r.__error}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2 pt-2">
            <p className="text-sm text-muted-foreground mb-2">Results:</p>
            <ul className="rounded-sm border border-border bg-card divide-y divide-border max-h-72 overflow-y-auto">
              {results.map((r, i) => (
                <li
                  key={i}
                  className="px-3 py-2 text-xs flex items-start gap-2"
                >
                  {r.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-accent shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 mt-0.5 text-destructive shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{r.email}</p>
                    <p className="text-muted-foreground text-[11px]">
                      {r.ok
                        ? r.status === "existing"
                          ? "Existing user — vendor profile created/found"
                          : "Invite sent + skeleton profile created"
                        : r.reason}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter className="pt-2 gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="rounded-full"
          >
            {results ? "Close" : "Cancel"}
          </Button>
          {!results ? (
            <Button
              type="button"
              onClick={submit}
              disabled={submitting || valid.length === 0}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5 mr-1.5" />
              )}
              Import {valid.length} vendor{valid.length === 1 ? "" : "s"}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={reset}
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              Import more
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
