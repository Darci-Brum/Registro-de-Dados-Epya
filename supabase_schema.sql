-- EPYA Controle de Qualidade - Estrutura sugerida para Supabase
-- Execute no SQL Editor do Supabase.
-- Depois, ajuste as políticas de RLS conforme os e-mails reais dos usuários.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'consulta' check (role in ('admin', 'inspetor', 'encarregado', 'consulta')),
  status text not null default 'Ativo' check (status in ('Ativo', 'Inativo')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.rdos (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  shift text default 'Diurno',
  project text not null,
  location text,
  weather text,
  status text default 'Em andamento',
  activities text,
  issues text,
  quality text,
  attachments jsonb default '[]'::jsonb,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  category text not null,
  supplier text,
  value numeric(12,2) not null default 0,
  payment text,
  description text,
  attachments jsonb default '[]'::jsonb,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  leader text,
  team_group text,
  phone text,
  status text default 'Ativo',
  notes text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id),
  model text,
  plate text,
  color text,
  odometer numeric(12,0),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.vehicle_costs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  date date not null,
  type text not null,
  value numeric(12,2) not null default 0,
  km numeric(12,0),
  description text,
  attachments jsonb default '[]'::jsonb,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.agenda_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date_time timestamptz not null,
  priority text default 'Normal' check (priority in ('Normal', 'Alta', 'Crítica')),
  status text default 'Pendente' check (status in ('Pendente', 'Concluído', 'Adiado')),
  notes text,
  notified boolean default false,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Bucket para anexos. Também pode ser criado pela tela Storage do Supabase.
insert into storage.buckets (id, name, public)
values ('epya-anexos', 'epya-anexos', false)
on conflict (id) do nothing;

-- Função auxiliar para reconhecer administradores.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'Ativo'
  );
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.rdos enable row level security;
alter table public.expenses enable row level security;
alter table public.team_members enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_costs enable row level security;
alter table public.agenda_items enable row level security;

-- Profiles: o usuário vê seu próprio perfil; admin vê todos.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
for all using (public.is_admin()) with check (public.is_admin());

-- Módulos: usuários autenticados podem ler; admin, inspetor e encarregado podem inserir/editar.
do $$
declare
  tbl text;
begin
  foreach tbl in array array['rdos','expenses','team_members','vehicles','vehicle_costs','agenda_items'] loop
    execute format('drop policy if exists %I on public.%I', tbl || '_select_auth', tbl);
    execute format('create policy %I on public.%I for select using (auth.uid() is not null)', tbl || '_select_auth', tbl);

    execute format('drop policy if exists %I on public.%I', tbl || '_insert_allowed', tbl);
    execute format($policy$
      create policy %I on public.%I
      for insert with check (
        exists (
          select 1 from public.profiles
          where id = auth.uid()
            and role in ('admin','inspetor','encarregado')
            and status = 'Ativo'
        )
      )
    $policy$, tbl || '_insert_allowed', tbl);

    execute format('drop policy if exists %I on public.%I', tbl || '_update_allowed', tbl);
    execute format($policy$
      create policy %I on public.%I
      for update using (
        exists (
          select 1 from public.profiles
          where id = auth.uid()
            and role in ('admin','inspetor','encarregado')
            and status = 'Ativo'
        )
      ) with check (
        exists (
          select 1 from public.profiles
          where id = auth.uid()
            and role in ('admin','inspetor','encarregado')
            and status = 'Ativo'
        )
      )
    $policy$, tbl || '_update_allowed', tbl);

    execute format('drop policy if exists %I on public.%I', tbl || '_delete_admin', tbl);
    execute format('create policy %I on public.%I for delete using (public.is_admin())', tbl || '_delete_admin', tbl);
  end loop;
end $$;

-- Políticas para arquivos no Storage: usuários autenticados podem ler e enviar; somente admin pode deletar.
drop policy if exists "epya_storage_read" on storage.objects;
create policy "epya_storage_read" on storage.objects
for select using (bucket_id = 'epya-anexos' and auth.uid() is not null);

drop policy if exists "epya_storage_insert" on storage.objects;
create policy "epya_storage_insert" on storage.objects
for insert with check (bucket_id = 'epya-anexos' and auth.uid() is not null);

drop policy if exists "epya_storage_delete_admin" on storage.objects;
create policy "epya_storage_delete_admin" on storage.objects
for delete using (bucket_id = 'epya-anexos' and public.is_admin());
