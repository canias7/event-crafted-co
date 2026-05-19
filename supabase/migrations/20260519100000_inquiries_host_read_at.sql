-- Mirror of inquiries.vendor_read_at for the host side. Set when
-- a host opens an inquiry detail page (HostInquiryDetailPage); used
-- by the vendor's chat composer to render "Seen at X" under the
-- last outgoing bubble.

alter table public.inquiries
  add column if not exists host_read_at timestamptz;

update public.inquiries
   set host_read_at = greatest(coalesce(updated_at, created_at), created_at)
 where host_read_at is null
   and status in ('replied','won','lost');
