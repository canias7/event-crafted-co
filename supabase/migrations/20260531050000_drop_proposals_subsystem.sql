-- Retire the payable-proposal subsystem.
--
-- Proposals were replaced by the Files-driven flow: vendors send
-- proposals/contracts as text documents from the chat "Send" menu, and
-- collect money via Invoices + Pay Links only (host can pay solely when
-- the vendor shares a link/invoice). The proposal payment path (host
-- Accept → /pay/:proposalId → webhook payment_status) is gone from the
-- app, the webhook + my-space-chat no longer reference proposals, and the
-- old proposal components / checkout pages are deleted.
--
-- ⚠️ DESTRUCTIVE + IRREVERSIBLE. Drops:
--   * proposals               — includes historical paid records
--   * proposal_templates      — the old rich proposal-template store
--     (replaced by vendor_proposal_templates, which is KEPT)
--   * get_vendor_dashboard_kpis — orphaned RPC (no web/mobile caller)
--     whose body queried proposals; would error once the table is gone.
--
-- KEPT intentionally:
--   * vendor_proposal_templates  — NEW Files proposal templates
--   * vendor_contract_templates  — Files contract templates
--   * vendor_document_defaults   — legacy single-template store still read
--     by the Files composer's one-time migration path
--   * invoices / payment_links   — the live money path
--
-- APPLY ORDER: must run AFTER the updated edge functions deploy —
-- vendorapay-webhook (proposal branches removed) and my-space-chat (no
-- longer counts proposals). The deploy-edge-functions CI runs on merge
-- before this migration takes effect, so charge.refunded / charge.disputed
-- never query a dropped table mid-flight.
--
-- Left orphaned (no app caller, harmless): vendorapay-charge and
-- stripe-create-checkout still reference proposals in their bodies, but
-- nothing invokes them, so a dropped table can't break a live flow.

drop function if exists public.get_vendor_dashboard_kpis(uuid);

drop table if exists public.proposals cascade;
drop table if exists public.proposal_templates cascade;
