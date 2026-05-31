-- Automated booking: link a pay link to the inquiry it was sent from, so
-- a successful payment can auto-confirm the booking (no manual handshake).
--
-- Stage 1: ChatSendPicker stamps inquiry_id when the vendor sends a pay
--   link from an inquiry chat.
-- Stage 2: vendorapay-webhook, on payment_intent.succeeded for a pay link
--   that has inquiry_id, stamps BOTH booking-confirmed timestamps (payment
--   proves both sides) and flips the inquiry to 'won'.
--
-- Nullable + ON DELETE SET NULL: links created outside a chat (or whose
-- inquiry is later deleted) simply carry no inquiry_id and skip auto-book.
-- Invoices intentionally NOT linked here — pay-links-only per product call.

alter table public.payment_links
  add column if not exists inquiry_id uuid references public.inquiries(id) on delete set null;

create index if not exists payment_links_inquiry_id_idx
  on public.payment_links (inquiry_id) where inquiry_id is not null;
