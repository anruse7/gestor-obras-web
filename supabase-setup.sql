-- ============================================================
--  SETUP SUPABASE para "Gestor de Obras MT/BT"
--  Cómo usar:
--    1. Entra en https://supabase.com/dashboard/project/uxjceeiurdrinklmicdl/sql/new
--    2. Pega todo este bloque y pulsa "Run"
-- ============================================================

-- >>> REPARAR (si ya tienes la tabla creada pero no se guarda en la nube) <<<
--   Si al guardar ves el aviso "La nube rechaza las escrituras", la tabla kv existe
--   pero le falta la política de acceso. Ejecuta SOLO estas dos líneas:
--     drop policy if exists "acceso_abierto" on public.kv;
--     create policy "acceso_abierto" on public.kv for all using (true) with check (true);

create table if not exists public.kv (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.kv enable row level security;

-- Política abierta: cualquier usuario con el enlace de la web puede
-- leer y escribir. Es lo que hace que TODO EL EQUIPO comparta las obras
-- sin pedir login. Si más adelante quieres restringirlo, se cambia esto.
drop policy if exists "acceso_abierto" on public.kv;
create policy "acceso_abierto"
  on public.kv
  for all
  using (true)
  with check (true);

-- Índice para búsquedas por prefijo (obra:<id>, fotos:<id>)
create index if not exists kv_key_idx on public.kv (key);

-- ============================================================
--  REGISTRO DE VERSIONES DE LA APP (tabla public.versiones)
--  Guarda cada snapshot subido con subir-version.bat.
-- ============================================================

create table if not exists public.versiones (
  id bigint generated always as identity primary key,
  nombre text not null,
  fecha timestamptz not null default now(),
  notas text not null default '',
  archivos text not null default '',
  created_at timestamptz not null default now()
);

alter table public.versiones enable row level security;

drop policy if exists "acceso_abierto" on public.versiones;
create policy "acceso_abierto"
  on public.versiones
  for all
  using (true)
  with check (true);
