-- Run this in your Supabase SQL editor to create the deals table
-- (only the columns the app actually inserts)

create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  applicant_name text not null,
  loan_amount numeric not null,
  loan_type text not null,
  status text not null default 'pending',
  risk_score integer default 0,
  created_at timestamptz default now()
);

alter table deals enable row level security;

create policy "Users can view own deals" on deals
  for select using (auth.uid() = user_id);

create policy "Users can insert own deals" on deals
  for insert with check (auth.uid() = user_id);

create policy "Users can update own deals" on deals
  for update using (auth.uid() = user_id);

create policy "Users can delete own deals" on deals
  for delete using (auth.uid() = user_id);
