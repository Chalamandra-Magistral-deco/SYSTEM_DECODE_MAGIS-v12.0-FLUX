-- MAGIS // VIDEO OPERATION OWNERSHIP
-- Server-only mapping between the authenticated user,
-- our internal operation id, and the provider operation/media URI.

create table if not exists public.video_operations (
  operation_id uuid primary key,
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  provider_operation_name text unique,
  video_uri text,
  status text not null default 'pending'
    check (status in ('pending', 'complete', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists video_operations_user_created_idx
  on public.video_operations(user_id, created_at desc);

alter table public.video_operations enable row level security;

revoke all
on table public.video_operations
from public, anon, authenticated;

grant select, insert, update, delete
on table public.video_operations
to service_role;
