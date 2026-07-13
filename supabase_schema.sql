-- EPYA Controle de Qualidade - Supabase
-- Execute este arquivo no SQL Editor do projeto:
-- https://eerebnizeuwxxqoxhjqh.supabase.co
-- Admin principal autorizado: DarciBrum3010@gmail.com

create extension if not exists pgcrypto;

-- =========================
-- Funções auxiliares
-- =========================
create or replace function public.normalize_email(p_email text)
returns text
language sql
immutable
as $$
  select lower(trim(coalesce(p_email, '')));
$$;

create table if not exists public.profiles (
  id text primary key default gen_random_uuid()::text,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  email text not null unique,
  role text not null default 'consulta' check (role in ('admin', 'analista', 'consulta')),
  status text not null default 'Ativo' check (status in ('Ativo', 'Inativo')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_email_lower_idx on public.profiles (public.normalize_email(email));

insert into public.profiles (id, name, email, role, status, notes)
values (
  'usr-darci-admin',
  'Darci Brum',
  'DarciBrum3010@gmail.com',
  'admin',
  'Ativo',
  'Administrador principal do sistema EPYA.'
)
on conflict (email) do update set
  role = 'admin',
  status = 'Ativo',
  name = excluded.name,
  notes = excluded.notes,
  updated_at = now();

create or replace function public.is_email_preapproved(p_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where public.normalize_email(email) = public.normalize_email(p_email)
      and status = 'Ativo'
  );
$$;

grant execute on function public.is_email_preapproved(text) to anon, authenticated;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select role
    from public.profiles
    where auth_user_id = auth.uid()
      and status = 'Ativo'
    limit 1
  ), '');
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where auth_user_id = auth.uid()
      and status = 'Ativo'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() = 'admin';
$$;

create or replace function public.can_write_app_data()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('admin', 'analista');
$$;

-- Trigger de segurança: só cria Auth para e-mails pré-cadastrados.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_profile public.profiles%rowtype;
  incoming_email text := public.normalize_email(new.email);
begin
  select * into existing_profile
  from public.profiles
  where public.normalize_email(email) = incoming_email
  limit 1;

  if incoming_email = public.normalize_email('DarciBrum3010@gmail.com') and existing_profile.id is null then
    insert into public.profiles (id, auth_user_id, name, email, role, status, notes)
    values ('usr-darci-admin', new.id, 'Darci Brum', new.email, 'admin', 'Ativo', 'Administrador principal do sistema EPYA.')
    on conflict (email) do update set auth_user_id = excluded.auth_user_id, role = 'admin', status = 'Ativo', updated_at = now();
    return new;
  end if;

  if existing_profile.id is null or existing_profile.status <> 'Ativo' then
    raise exception 'E-mail não autorizado pelo administrador: %', new.email;
  end if;

  update public.profiles
  set auth_user_id = new.id,
      name = coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), existing_profile.name),
      updated_at = now()
  where id = existing_profile.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_epya on auth.users;
create trigger on_auth_user_created_epya
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- =========================
-- Tabelas operacionais
-- =========================
create table if not exists public.rdos (
  id text primary key,
  date date not null,
  shift text,
  project text not null,
  location text,
  weather text,
  status text,
  activities text,
  issues text,
  quality text,
  attachments jsonb not null default '[]'::jsonb,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id text primary key,
  date date not null,
  category text,
  supplier text,
  value numeric(12,2) not null default 0,
  payment text,
  description text,
  attachments jsonb not null default '[]'::jsonb,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_members (
  id text primary key,
  name text not null,
  member_role text,
  leader text,
  team_group text,
  phone text,
  status text not null default 'Ativo',
  notes text,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id text primary key,
  model text,
  plate text,
  color text,
  odometer numeric(12,0),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicle_costs (
  id text primary key,
  date date not null,
  cost_type text,
  value numeric(12,2) not null default 0,
  km numeric(12,0),
  description text,
  attachments jsonb not null default '[]'::jsonb,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agenda_items (
  id text primary key,
  title text not null,
  date_time timestamptz not null,
  priority text,
  status text,
  notes text,
  notified boolean not null default false,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================
-- RLS e permissões
-- =========================
alter table public.profiles enable row level security;
alter table public.rdos enable row level security;
alter table public.expenses enable row level security;
alter table public.team_members enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_costs enable row level security;
alter table public.agenda_items enable row level security;

-- Profiles: admin gerencia todos; usuário autenticado vê o próprio perfil.
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (public.is_admin() or auth_user_id = auth.uid() or public.normalize_email(email) = public.normalize_email(auth.jwt() ->> 'email'));

drop policy if exists "profiles_admin_insert" on public.profiles;
create policy "profiles_admin_insert"
on public.profiles
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update"
on public.profiles
for update
to authenticated
using (public.is_admin() or auth_user_id = auth.uid())
with check (public.is_admin() or auth_user_id = auth.uid());

drop policy if exists "profiles_admin_delete" on public.profiles;
create policy "profiles_admin_delete"
on public.profiles
for delete
to authenticated
using (public.is_admin() and public.normalize_email(email) <> public.normalize_email('DarciBrum3010@gmail.com'));

-- Função auxiliar para políticas das tabelas operacionais.
-- Consulta vê; Admin e Analista criam, editam e excluem.
do $$
declare
  tbl text;
begin
  foreach tbl in array array['rdos','expenses','team_members','vehicles','vehicle_costs','agenda_items'] loop
    execute format('drop policy if exists %I on public.%I', tbl || '_select_active', tbl);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_active_user())', tbl || '_select_active', tbl);

    execute format('drop policy if exists %I on public.%I', tbl || '_insert_writer', tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_write_app_data())', tbl || '_insert_writer', tbl);

    execute format('drop policy if exists %I on public.%I', tbl || '_update_writer', tbl);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_write_app_data()) with check (public.can_write_app_data())', tbl || '_update_writer', tbl);

    execute format('drop policy if exists %I on public.%I', tbl || '_delete_writer', tbl);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_write_app_data())', tbl || '_delete_writer', tbl);
  end loop;
end $$;


-- Grants para o Data API / supabase-js
grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.rdos to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.team_members to authenticated;
grant select, insert, update, delete on public.vehicles to authenticated;
grant select, insert, update, delete on public.vehicle_costs to authenticated;
grant select, insert, update, delete on public.agenda_items to authenticated;

-- Índices úteis
create index if not exists rdos_date_idx on public.rdos(date desc);
create index if not exists expenses_date_idx on public.expenses(date desc);
create index if not exists team_members_name_idx on public.team_members(name);
create index if not exists vehicle_costs_date_idx on public.vehicle_costs(date desc);
create index if not exists agenda_items_date_time_idx on public.agenda_items(date_time);

-- Após rodar este SQL:
-- 1) Vá em Authentication > Users e crie o usuário DarciBrum3010@gmail.com com uma senha.
-- 2) Confirme o e-mail do usuário, se a confirmação estiver ativa.
-- 3) Faça login no site com esse e-mail.
-- 4) Cadastre novos e-mails na aba Usuários e perfis.
-- 5) Cada novo usuário entra em "Primeiro acesso" e cria a própria senha.


alter table if exists public.team_members add column if not exists last_visit_date date;
alter table if exists public.team_members add column if not exists visit_count integer default 0;

-- =========================
-- ATUALIZAÇÃO: Não conformidades e Frentes/Obras
-- (seguro para rodar mais de uma vez)
-- =========================

create table if not exists public.ncs (
  id text primary key,
  date date not null,
  project text,
  nc_type text,
  severity text not null default 'Leve' check (severity in ('Leve', 'Média', 'Crítica')),
  responsible text,
  deadline date,
  status text not null default 'Aberta' check (status in ('Aberta', 'Em tratativa', 'Fechada')),
  description text,
  corrective_action text,
  attachments jsonb not null default '[]'::jsonb,
  closed_at timestamptz,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists projects_name_lower_idx on public.projects (lower(trim(name)));

alter table public.ncs enable row level security;
alter table public.projects enable row level security;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['ncs', 'projects'] loop
    execute format('drop policy if exists %I on public.%I', tbl || '_select_active', tbl);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_active_user())', tbl || '_select_active', tbl);

    execute format('drop policy if exists %I on public.%I', tbl || '_insert_writer', tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_write_app_data())', tbl || '_insert_writer', tbl);

    execute format('drop policy if exists %I on public.%I', tbl || '_update_writer', tbl);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_write_app_data()) with check (public.can_write_app_data())', tbl || '_update_writer', tbl);

    execute format('drop policy if exists %I on public.%I', tbl || '_delete_writer', tbl);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_write_app_data())', tbl || '_delete_writer', tbl);
  end loop;
end;
$$;

grant select, insert, update, delete on public.ncs to authenticated;
grant select, insert, update, delete on public.projects to authenticated;

create index if not exists ncs_date_idx on public.ncs(date desc);
create index if not exists ncs_status_idx on public.ncs(status);
create index if not exists projects_name_idx on public.projects(name);

-- =========================
-- ATUALIZAÇÃO: Log de visitas (heatmap de visitas por equipe)
-- (seguro para rodar mais de uma vez)
-- =========================

create table if not exists public.visit_logs (
  id text primary key,
  team_member_id text references public.team_members(id) on delete cascade,
  project text,
  date date not null,
  notes text,
  created_by text,
  created_at timestamptz not null default now()
);

alter table public.visit_logs enable row level security;

do $$
begin
  execute format('drop policy if exists %I on public.%I', 'visit_logs_select_active', 'visit_logs');
  execute format('create policy %I on public.%I for select to authenticated using (public.is_active_user())', 'visit_logs_select_active', 'visit_logs');

  execute format('drop policy if exists %I on public.%I', 'visit_logs_insert_writer', 'visit_logs');
  execute format('create policy %I on public.%I for insert to authenticated with check (public.can_write_app_data())', 'visit_logs_insert_writer', 'visit_logs');

  execute format('drop policy if exists %I on public.%I', 'visit_logs_update_writer', 'visit_logs');
  execute format('create policy %I on public.%I for update to authenticated using (public.can_write_app_data()) with check (public.can_write_app_data())', 'visit_logs_update_writer', 'visit_logs');

  execute format('drop policy if exists %I on public.%I', 'visit_logs_delete_writer', 'visit_logs');
  execute format('create policy %I on public.%I for delete to authenticated using (public.can_write_app_data())', 'visit_logs_delete_writer', 'visit_logs');
end;
$$;

grant select, insert, update, delete on public.visit_logs to authenticated;

create index if not exists visit_logs_date_idx on public.visit_logs(date desc);
create index if not exists visit_logs_team_member_idx on public.visit_logs(team_member_id);
