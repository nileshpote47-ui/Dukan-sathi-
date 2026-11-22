-- Phase 9: how many connected accounts one post may go to at the same time, per plan (owner's decision):
-- Free 1, Starter 1, Growth 2, Premium 4. Plan data, never hard-coded; enforced on the server.

alter table public.billing_plans
  add column max_accounts_per_post integer not null default 1
    check (max_accounts_per_post between 1 and 10);

comment on column public.billing_plans.max_accounts_per_post is 'How many accounts one post may be sent to at once (publish page and Autopilot).';

update public.billing_plans set max_accounts_per_post = v.n
from (values ('free', 1), ('starter', 1), ('growth', 2), ('premium', 4)) as v (slug, n)
where billing_plans.slug = v.slug;
