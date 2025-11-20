-- Create user role enum
create type public.app_role as enum ('admin', 'agent', 'client');

-- Create profiles table
create table public.profiles (
  id uuid not null references auth.users on delete cascade,
  full_name text,
  phone_number text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (id)
);

alter table public.profiles enable row level security;

-- Create user_roles table
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

-- Create wallet table for clients
create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  balance decimal(10, 2) not null default 0.00,
  currency text not null default 'USD',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.wallets enable row level security;

-- Security definer function to check roles
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

-- Profiles policies
create policy "Users can view their own profile"
on public.profiles for select
using (auth.uid() = id);

create policy "Users can update their own profile"
on public.profiles for update
using (auth.uid() = id);

create policy "Users can insert their own profile"
on public.profiles for insert
with check (auth.uid() = id);

-- User roles policies
create policy "Users can view their own roles"
on public.user_roles for select
using (auth.uid() = user_id);

create policy "Admins can view all roles"
on public.user_roles for select
using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can insert roles"
on public.user_roles for insert
with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can update roles"
on public.user_roles for update
using (public.has_role(auth.uid(), 'admin'));

-- Wallet policies
create policy "Users can view their own wallet"
on public.wallets for select
using (auth.uid() = user_id);

create policy "Users can insert their own wallet"
on public.wallets for insert
with check (auth.uid() = user_id);

create policy "Users can update their own wallet"
on public.wallets for update
using (auth.uid() = user_id);

create policy "Agents can view client wallets"
on public.wallets for select
using (public.has_role(auth.uid(), 'agent') or public.has_role(auth.uid(), 'admin'));

-- Function to handle new user creation
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone_number)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone_number'
  );
  
  -- Insert default role (client) if no role specified
  insert into public.user_roles (user_id, role)
  values (new.id, coalesce((new.raw_user_meta_data ->> 'role')::app_role, 'client'));
  
  -- Create wallet for client users
  if coalesce((new.raw_user_meta_data ->> 'role')::app_role, 'client') = 'client' then
    insert into public.wallets (user_id)
    values (new.id);
  end if;
  
  return new;
end;
$$;

-- Trigger for new user creation
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Function to update timestamps
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = public;

-- Triggers for updated_at
create trigger update_profiles_updated_at
before update on public.profiles
for each row
execute function public.update_updated_at_column();

create trigger update_wallets_updated_at
before update on public.wallets
for each row
execute function public.update_updated_at_column();