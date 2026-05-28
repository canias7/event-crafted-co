-- Add optional item_name + quantity columns to vendor_expenses so
-- the New expense form can capture what the line item is and how
-- much of it (e.g. "Cement bags" / "20 lbs"). Both are nullable
-- text — quantity stays text rather than int so vendors can type
-- units like "5 boxes" or "20 lbs" without us having to model
-- units separately.

alter table public.vendor_expenses
  add column if not exists item_name text,
  add column if not exists quantity text;
