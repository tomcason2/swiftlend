-- Run this in your Supabase SQL editor.
-- Safe to run on a fresh project (IF NOT EXISTS) or an existing table.

create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  applicant_name text not null,
  loan_amount numeric not null,
  loan_type text not null,
  status text not null default 'pending',
  risk_score integer default 0,
  abn text,
  created_at timestamptz default now()
);

-- Add abn column if this table was created before it was included:
alter table deals add column if not exists abn text;

alter table deals enable row level security;

-- Policies are idempotent — drop first if re-running on an existing table.
drop policy if exists "Users can view own deals"   on deals;
drop policy if exists "Users can insert own deals" on deals;
drop policy if exists "Users can update own deals" on deals;
drop policy if exists "Users can delete own deals" on deals;

create policy "Users can view own deals"   on deals for select using (auth.uid() = user_id);
create policy "Users can insert own deals" on deals for insert with check (auth.uid() = user_id);
create policy "Users can update own deals" on deals for update using (auth.uid() = user_id);
create policy "Users can delete own deals" on deals for delete using (auth.uid() = user_id);
