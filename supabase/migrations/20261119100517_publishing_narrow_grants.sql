-- Phase 6: narrow function grants. Supabase grants EXECUTE on new public functions to anon and
-- authenticated by default; revoke what each publishing entry point does not need.
-- Signed-in owner only (need auth.uid()):
revoke execute on function public.publishing_connect_account(text, text, text, text, text, text, text[], jsonb, text, timestamptz) from anon;
revoke execute on function public.publishing_create_job(text, uuid, uuid, timestamptz, text, uuid, text, text, jsonb, jsonb, boolean) from anon;
revoke execute on function public.publishing_retry_job(text, uuid, text) from anon;
-- Runner / webhooks only (no session):
revoke execute on function public.publishing_claim_due(text, integer) from authenticated;
revoke execute on function public.publishing_process_whatsapp_webhook(text, text, text, jsonb, jsonb) from authenticated;
revoke execute on function public.publishing_revoke_provider_user(text, text, text) from authenticated;
