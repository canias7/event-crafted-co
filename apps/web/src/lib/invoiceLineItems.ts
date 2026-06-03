// Invoice line items have drifted across a few key shapes over time:
//   • canonical (current composer):  { name, qty, unit_price_cents, total_cents }
//   • checkout-page legacy:          { description, qty, unit_price_cents }
//   • seeded/older rows:             { description, quantity, unit_amount_cents }
// Renderers + the PDF builder assumed one shape and printed "$NaN" / blank
// names for the others. Normalize at every read site so all shapes work.

export interface NormalizedLineItem {
  name: string;
  qty: number;
  unit_price_cents: number;
  total_cents: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeInvoiceLineItem(raw: any): NormalizedLineItem {
  const name = (raw?.name ?? raw?.description ?? "").toString();
  const qty = Number(raw?.qty ?? raw?.quantity ?? 1) || 1;
  const unit_price_cents =
    Math.round(Number(raw?.unit_price_cents ?? raw?.unit_amount_cents ?? 0)) ||
    0;
  const total_cents =
    Math.round(Number(raw?.total_cents ?? unit_price_cents * qty)) ||
    unit_price_cents * qty;
  return { name, qty, unit_price_cents, total_cents };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeInvoiceLineItems(arr: any): NormalizedLineItem[] {
  return Array.isArray(arr) ? arr.map(normalizeInvoiceLineItem) : [];
}
