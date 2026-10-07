create table if not exists public.operation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  operation_id uuid,
  feature text not null check (feature in ('media')),
  action text not null check (action in ('video.generate')),
  status text not null check (status in ('READY', 'FAILED', 'TIMEOUT', 'CANCELLED')),
  duration_ms integer not null check (duration_ms between 0 and 86400000),
  model text not null check (model in ('veo-3.1-generate-preview')),
  error_code text check (
    error_code is null or error_code in (
      'AUTH_ERROR',
      'VALIDATION_ERROR',
      'RATE_LIMIT',
      'PROVIDER_ERROR',
      'NETWORK_ERROR',
      'TIMEOUT',
      'UNKNOWN'
    )
  ),
  retry boolean not null default false,
  rating smallint check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  constraint operation_feedback_request_action_unique
    unique (user_id, request_id, action, status)
);

create index if not exists operation_feedback_created_status_idx
  on public.operation_feedback(created_at desc, status);

alter table public.operation_feedback enable row level security;

revoke all on table public.operation_feedback from public, anon, authenticated;
grant select, insert, update on table public.operation_feedback to service_role;

create or replace view public.operation_feedback_daily_metrics
with (security_invoker = true)
as
with ranked_events as (
  select
    feedback.*,
    row_number() over (
      partition by user_id, request_id, action
      order by created_at desc, id desc
    ) as event_rank,
    bool_or(status = 'TIMEOUT') over (
      partition by user_id, request_id, action
    ) as had_timeout,
    bool_or(retry) over (
      partition by user_id, request_id, action
    ) as was_retry
  from public.operation_feedback as feedback
),
latest_operations as (
  select *
  from ranked_events
  where event_rank = 1
)
select
  date_trunc('day', created_at)::date as metric_date,
  feature,
  action,
  model,
  count(*) as operation_count,
  count(*) filter (where status = 'READY') as success_count,
  count(*) filter (where status = 'FAILED') as failure_count,
  count(*) filter (where had_timeout) as timeout_count,
  count(*) filter (where was_retry) as retry_count,
  count(*) filter (where status = 'READY')::numeric / nullif(count(*), 0) as success_rate,
  count(*) filter (where status = 'FAILED')::numeric / nullif(count(*), 0) as failure_rate,
  count(*) filter (where had_timeout)::numeric / nullif(count(*), 0) as timeout_rate,
  count(*) filter (where was_retry)::numeric / nullif(count(*), 0) as retry_rate,
  avg(duration_ms)::numeric as mean_latency_ms,
  percentile_cont(0.95) within group (order by duration_ms) as p95_latency_ms
from latest_operations
group by date_trunc('day', created_at)::date, feature, action, model;

revoke all on public.operation_feedback_daily_metrics from public, anon, authenticated;
grant select on public.operation_feedback_daily_metrics to service_role;
