-- Phase 6: WhatsApp recipients are re-checked when a job is actually sent: a customer who opted
-- out (e.g. replied STOP) after the send was scheduled is skipped. Only for a job being sent.
create or replace function public.publishing_whatsapp_recipients(p_secret text, p_job_id uuid)
returns table (contact_id uuid, phone_e164 text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.publishing_assert_server(p_secret);
  return query
  select c.id, c.phone_e164
  from public.publishing_jobs j
  join public.publishing_job_payloads p on p.job_id = j.id
  join public.whatsapp_contacts c
    on c.business_id = j.business_id
   and c.id::text in (select jsonb_array_elements_text(coalesce(p.payload -> 'contact_ids', '[]'::jsonb)))
  where j.id = p_job_id and j.status = 'SENDING' and j.channel = 'WHATSAPP' and c.opted_out_at is null
    and ((select auth.uid()) is null or j.owner_id = (select auth.uid()))
  order by c.created_at
  limit 50;
end;
$$;

revoke execute on function public.publishing_whatsapp_recipients(text, uuid) from public;
grant execute on function public.publishing_whatsapp_recipients(text, uuid) to anon, authenticated;
