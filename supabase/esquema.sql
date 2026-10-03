-- ============================================================================
-- SONOMIN · esquema de la base de datos en Supabase
-- Pegar COMPLETO en: Supabase > SQL Editor > New query > Run
-- Se puede ejecutar mas de una vez sin romper nada.
-- ============================================================================

-- ---------------------------------------------------------------- perfiles
-- Cada usuario (creado en Authentication > Users) recibe un rol:
--   celular : el telefono que mide. Puede escribir mediciones, nivel en vivo y fotos.
--   lector  : el jefe u otras personas. Solo ve.
--   admin   : tu. Ve, escribe y puede borrar.
create table if not exists public.perfiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  rol     text not null check (rol in ('celular', 'lector', 'admin'))
);
alter table public.perfiles enable row level security;

create or replace function public.rol_actual()
returns text
language sql stable security definer
set search_path = public
as $$
  select rol from public.perfiles where user_id = auth.uid()
$$;
revoke all on function public.rol_actual() from public;
grant execute on function public.rol_actual() to authenticated;

drop policy if exists perfiles_propio on public.perfiles;
create policy perfiles_propio on public.perfiles
  for select to authenticated using (user_id = auth.uid());

-- -------------------------------------------------------------- mediciones
-- Una fila por medicion (o por tramo de un recorrido / bloque de jornada).
-- 'uuid' lo genera el celular: sirve para no duplicar si reenvia.
create table if not exists public.mediciones (
  uuid                   uuid primary key,
  proyecto               text        not null,
  proyecto_id            bigint,
  modo                   text,       -- PUNTUAL | RECORRIDO | JORNADA | CONTINUO
  recorrido_id           text,
  secuencia              integer,
  inicio_ms              bigint      not null,   -- epoch en milisegundos (UTC)
  fecha_hora             timestamptz generated always as (to_timestamp(inicio_ms / 1000.0)) stored,
  turno_eca              text,       -- DIURNO | NOCTURNO
  ambito                 text,       -- SUPERFICIE | INTERIOR
  punto                  text,
  labor                  text,
  fuente_ruido           text,
  este                   double precision,
  norte                  double precision,
  cota                   double precision,
  tipo_cota              text,
  zona_utm               text,
  latitud                double precision,
  longitud               double precision,
  origen_posicion        text,
  precision_m            double precision,
  duracion_s             double precision,
  leq_dba                double precision not null,
  lmax_dba               double precision,
  lmin_dba               double precision,
  l10_dba                double precision,
  l50_dba                double precision,
  l90_dba                double precision,
  zona_eca               text,
  limite_eca_dba         double precision,
  limite_ocupacional_dba double precision,
  tiempo_permitido_h     double precision,
  horas_exposicion       double precision,
  dosis_pct              double precision,
  offset_cal_db          double precision,
  calibrado              boolean,
  saturacion_pct         double precision,
  fuente_audio           text,
  evaluador              text,
  observacion            text,
  serie_1s               text,       -- niveles de 1 s separados por |
  fotos                  text[] not null default '{}',   -- rutas dentro del bucket 'fotos'
  creado                 timestamptz not null default now()
);
create index if not exists mediciones_proyecto_inicio on public.mediciones (proyecto, inicio_ms desc);
create index if not exists mediciones_inicio on public.mediciones (inicio_ms desc);
alter table public.mediciones enable row level security;

drop policy if exists mediciones_ver on public.mediciones;
create policy mediciones_ver on public.mediciones
  for select to authenticated using (public.rol_actual() is not null);

drop policy if exists mediciones_insertar on public.mediciones;
create policy mediciones_insertar on public.mediciones
  for insert to authenticated with check (public.rol_actual() in ('celular', 'admin'));

drop policy if exists mediciones_borrar on public.mediciones;
create policy mediciones_borrar on public.mediciones
  for delete to authenticated using (public.rol_actual() = 'admin');

-- -------------------------------------------------------------------- vivo
-- Una sola fila por celular ('id'); el celular la actualiza cada 2 s mientras mide.
create table if not exists public.vivo (
  id             text primary key default 'celular',
  proyecto       text,
  punto          text,
  modo           text,
  nivel_dba      double precision,
  leq_parcial    double precision,
  lmax_parcial   double precision,
  transcurrido_s double precision,
  objetivo_s     double precision,
  tramos         integer,
  dosis_pct      double precision,
  este           double precision,
  norte          double precision,
  cota           double precision,
  evaluador      text,
  calibrado      boolean,
  midiendo       boolean not null default true,
  ts             bigint,             -- epoch ms del celular
  actualizado    timestamptz not null default now()
);
alter table public.vivo enable row level security;

-- 'actualizado' lo fija el servidor en cada insercion o cambio: el upsert del celular no lo envia
-- y el tablero lo usa para saber si el celular sigue midiendo (reloj del servidor, no del celular).
create or replace function public.vivo_marcar_hora()
returns trigger language plpgsql as $$
begin
  new.actualizado := now();
  return new;
end;
$$;
drop trigger if exists vivo_hora on public.vivo;
create trigger vivo_hora before insert or update on public.vivo
  for each row execute function public.vivo_marcar_hora();

drop policy if exists vivo_ver on public.vivo;
create policy vivo_ver on public.vivo
  for select to authenticated using (public.rol_actual() is not null);

drop policy if exists vivo_insertar on public.vivo;
create policy vivo_insertar on public.vivo
  for insert to authenticated with check (public.rol_actual() in ('celular', 'admin'));

drop policy if exists vivo_actualizar on public.vivo;
create policy vivo_actualizar on public.vivo
  for update to authenticated
  using (public.rol_actual() in ('celular', 'admin'))
  with check (public.rol_actual() in ('celular', 'admin'));

-- ---------------------------------------------------------------- informes
-- Los escribe el proceso automatico (GitHub Actions) con la clave de servicio.
create table if not exists public.informes (
  id            bigint generated always as identity primary key,
  creado        timestamptz not null default now(),
  titulo        text not null,
  proyecto      text,
  n_mediciones  integer,
  resumen       jsonb,
  archivos      jsonb          -- [{"nombre": "...", "ruta": "carpeta/archivo"}]
);
alter table public.informes enable row level security;

drop policy if exists informes_ver on public.informes;
create policy informes_ver on public.informes
  for select to authenticated using (public.rol_actual() is not null);

-- ----------------------------------------------------------------- storage
-- 'fotos'    : evidencia de cada medicion  (ruta: <uuid de la medicion>/<archivo>.jpg)
-- 'informes' : PDF, Excel y mapas generados (ruta: <aaaa-mm-dd_hhmm>/<archivo>)
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false), ('informes', 'informes', false)
on conflict (id) do nothing;

drop policy if exists sonomin_leer on storage.objects;
create policy sonomin_leer on storage.objects
  for select to authenticated
  using (bucket_id in ('fotos', 'informes') and public.rol_actual() is not null);

drop policy if exists sonomin_subir_fotos on storage.objects;
create policy sonomin_subir_fotos on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos' and public.rol_actual() in ('celular', 'admin'));

drop policy if exists sonomin_actualizar_fotos on storage.objects;
create policy sonomin_actualizar_fotos on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos' and public.rol_actual() in ('celular', 'admin'))
  with check (bucket_id = 'fotos' and public.rol_actual() in ('celular', 'admin'));

-- ============================================================================
-- AMPLIACION v3 · tiempo real completo: varios celulares, rastro, actividad,
-- proyectos y gestion de accesos desde el tablero
-- ============================================================================

-- ------------------------------------------------- vivo: varios celulares
-- Cada celular usa su propio 'id' (identificador del equipo). Las apps antiguas siguen usando 'celular'.
alter table public.vivo add column if not exists dispositivo text;
alter table public.vivo add column if not exists latitud     double precision;
alter table public.vivo add column if not exists longitud    double precision;
alter table public.vivo add column if not exists precision_m double precision;
alter table public.vivo add column if not exists ambito      text;
alter table public.vivo add column if not exists inicio_ms   bigint;

-- ------------------------------------------------------------- posiciones
-- Rastro del celular mientras mide (lo llena un trigger: el celular no escribe aqui).
create table if not exists public.posiciones (
  id             bigint generated always as identity primary key,
  dispositivo_id text not null,
  proyecto       text,
  punto          text,
  latitud        double precision not null,
  longitud       double precision not null,
  este           double precision,
  norte          double precision,
  cota           double precision,
  nivel_dba      double precision,
  creado         timestamptz not null default now()
);
create index if not exists posiciones_disp_creado on public.posiciones (dispositivo_id, creado desc);
create index if not exists posiciones_creado on public.posiciones (creado desc);
alter table public.posiciones enable row level security;
drop policy if exists posiciones_ver on public.posiciones;
create policy posiciones_ver on public.posiciones
  for select to authenticated using (public.rol_actual() is not null);

-- ----------------------------------------------------------------- eventos
-- Registro de actividad: inicio y fin de cada medicion, mediciones guardadas y alertas.
-- Lo llenan triggers en el servidor, asi queda el historial aunque nadie tenga el tablero abierto.
create table if not exists public.eventos (
  id             bigint generated always as identity primary key,
  creado         timestamptz not null default now(),
  tipo           text not null,   -- INICIO | FIN | MEDICION | ALERTA_OCUPACIONAL | ALERTA_ECA
  dispositivo_id text,
  dispositivo    text,
  evaluador      text,
  proyecto       text,
  punto          text,
  modo           text,
  ambito         text,
  nivel_dba      double precision,
  latitud        double precision,
  longitud       double precision,
  este           double precision,
  norte          double precision,
  medicion_uuid  uuid,
  detalle        text
);
create index if not exists eventos_creado on public.eventos (creado desc);
alter table public.eventos enable row level security;
drop policy if exists eventos_ver on public.eventos;
create policy eventos_ver on public.eventos
  for select to authenticated using (public.rol_actual() is not null);
drop policy if exists eventos_borrar on public.eventos;
create policy eventos_borrar on public.eventos
  for delete to authenticated using (public.rol_actual() = 'admin');

-- Trigger de vivo: registra INICIO / FIN y guarda el rastro (cada 3 m de avance o cada 30 s).
create or replace function public.vivo_registrar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ult record;
  antes boolean := false;
begin
  if tg_op = 'UPDATE' then antes := coalesce(old.midiendo, false); end if;

  if new.midiendo and not antes then
    insert into eventos (tipo, dispositivo_id, dispositivo, evaluador, proyecto, punto, modo, ambito, nivel_dba, latitud, longitud, este, norte, detalle)
    values ('INICIO', new.id, new.dispositivo, new.evaluador, new.proyecto, new.punto, new.modo, new.ambito, new.nivel_dba,
            new.latitud, new.longitud, new.este, new.norte, 'Empezó a medir');
  elsif antes and not new.midiendo then
    insert into eventos (tipo, dispositivo_id, dispositivo, evaluador, proyecto, punto, modo, ambito, nivel_dba, latitud, longitud, este, norte, detalle)
    values ('FIN', new.id, new.dispositivo, new.evaluador, new.proyecto, new.punto, new.modo, new.ambito, new.leq_parcial,
            new.latitud, new.longitud, new.este, new.norte, 'Terminó de medir');
  end if;

  if new.midiendo and new.latitud is not null and new.longitud is not null then
    select creado, latitud, longitud into ult from posiciones
      where dispositivo_id = new.id order by creado desc limit 1;
    if not found
       or abs(ult.latitud - new.latitud) > 0.00003 or abs(ult.longitud - new.longitud) > 0.00003
       or now() - ult.creado > interval '30 seconds' then
      insert into posiciones (dispositivo_id, proyecto, punto, latitud, longitud, este, norte, cota, nivel_dba)
      values (new.id, new.proyecto, new.punto, new.latitud, new.longitud, new.este, new.norte, new.cota, new.nivel_dba);
    end if;
  end if;
  return null;
end;
$$;
drop trigger if exists vivo_registro on public.vivo;
create trigger vivo_registro after insert or update on public.vivo
  for each row execute function public.vivo_registrar();

-- Trigger de mediciones: evento MEDICION y alertas (ocupacional >= 85 dB(A); ECA en superficie).
create or replace function public.medicion_registrar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into eventos (tipo, evaluador, proyecto, punto, modo, ambito, nivel_dba, latitud, longitud, este, norte, medicion_uuid, detalle)
  values ('MEDICION', new.evaluador, new.proyecto, new.punto, new.modo, new.ambito, new.leq_dba, new.latitud, new.longitud,
          new.este, new.norte, new.uuid, 'Medición guardada · ' || coalesce(round(new.duracion_s)::text, '?') || ' s');
  if new.leq_dba >= coalesce(new.limite_ocupacional_dba, 85) then
    insert into eventos (tipo, evaluador, proyecto, punto, modo, ambito, nivel_dba, latitud, longitud, este, norte, medicion_uuid, detalle)
    values ('ALERTA_OCUPACIONAL', new.evaluador, new.proyecto, new.punto, new.modo, new.ambito, new.leq_dba, new.latitud, new.longitud,
            new.este, new.norte, new.uuid, 'Leq igual o mayor al límite ocupacional de 85 dB(A)');
  end if;
  if new.ambito = 'SUPERFICIE' and new.limite_eca_dba is not null and new.leq_dba > new.limite_eca_dba then
    insert into eventos (tipo, evaluador, proyecto, punto, modo, ambito, nivel_dba, latitud, longitud, este, norte, medicion_uuid, detalle)
    values ('ALERTA_ECA', new.evaluador, new.proyecto, new.punto, new.modo, new.ambito, new.leq_dba, new.latitud, new.longitud,
            new.este, new.norte, new.uuid, 'Supera el ECA de ' || new.limite_eca_dba || ' dB(A) (' || coalesce(new.zona_eca, '') || ', ' || coalesce(new.turno_eca, '') || ')');
  end if;
  return null;
end;
$$;
drop trigger if exists medicion_registro on public.mediciones;
create trigger medicion_registro after insert on public.mediciones
  for each row execute function public.medicion_registrar();

-- ---------------------------------------------------------- proyectos_meta
-- Datos de planificacion de cada proyecto (los edita el administrador en el tablero):
-- meta de puntos, fechas y estado. Con eso el tablero calcula el avance.
create table if not exists public.proyectos_meta (
  proyecto            text primary key,
  unidad_minera       text,
  responsable         text,
  objetivo_puntos     integer,
  objetivo_mediciones integer,
  fecha_inicio        date,
  fecha_fin           date,
  estado              text not null default 'EN CURSO' check (estado in ('PLANIFICADO', 'EN CURSO', 'PAUSADO', 'CERRADO')),
  notas               text,
  actualizado         timestamptz not null default now()
);
alter table public.proyectos_meta enable row level security;
drop policy if exists proyectos_meta_ver on public.proyectos_meta;
create policy proyectos_meta_ver on public.proyectos_meta
  for select to authenticated using (public.rol_actual() is not null);
drop policy if exists proyectos_meta_admin on public.proyectos_meta;
create policy proyectos_meta_admin on public.proyectos_meta
  for all to authenticated using (public.rol_actual() = 'admin') with check (public.rol_actual() = 'admin');

-- ------------------------------------------------------ gestion de accesos
-- Cualquier persona puede "Solicitar acceso" desde el tablero (crea su cuenta, sin rol = no ve nada).
-- El administrador la aprueba en la pestaña Accesos asignandole un rol, o se lo quita.
alter table public.perfiles add column if not exists asignado timestamptz default now();

drop policy if exists perfiles_admin on public.perfiles;
create policy perfiles_admin on public.perfiles
  for select to authenticated using (public.rol_actual() = 'admin');

create or replace function public.usuarios_acceso()
returns table (user_id uuid, email text, nombre text, motivo text, rol text, creado timestamptz,
               ultimo_ingreso timestamptz, confirmado boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if public.rol_actual() is distinct from 'admin' then
    raise exception 'Solo el administrador puede ver los accesos';
  end if;
  return query
    select u.id, u.email::text, (u.raw_user_meta_data ->> 'nombre')::text, (u.raw_user_meta_data ->> 'motivo')::text,
           p.rol, u.created_at, u.last_sign_in_at, (u.email_confirmed_at is not null)
    from auth.users u left join public.perfiles p on p.user_id = u.id
    order by (p.rol is null) desc, u.created_at desc;
end;
$$;
revoke all on function public.usuarios_acceso() from public;
grant execute on function public.usuarios_acceso() to authenticated;

create or replace function public.asignar_rol(p_usuario uuid, p_rol text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.rol_actual() is distinct from 'admin' then
    raise exception 'Solo el administrador puede dar o quitar accesos';
  end if;
  if p_usuario = auth.uid() and p_rol is distinct from 'admin' then
    raise exception 'No puede quitarse a sí mismo el rol de administrador';
  end if;
  if p_rol is null or p_rol = '' then
    delete from public.perfiles where user_id = p_usuario;
  elsif p_rol in ('celular', 'lector', 'admin') then
    insert into public.perfiles (user_id, rol, asignado) values (p_usuario, p_rol, now())
      on conflict (user_id) do update set rol = excluded.rol, asignado = now();
  else
    raise exception 'Rol no válido: %', p_rol;
  end if;
end;
$$;
revoke all on function public.asignar_rol(uuid, text) from public;
grant execute on function public.asignar_rol(uuid, text) to authenticated;

-- ------------------------------------------------------------- permisos
-- Privilegios de tabla para la API (las filas igual las filtra la seguridad por filas de arriba).
-- Hacen falta cuando el proyecto se creo con "Automatically expose new tables" desactivado.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on
  public.perfiles, public.mediciones, public.vivo, public.informes,
  public.posiciones, public.eventos, public.proyectos_meta
  to authenticated;
grant all on
  public.perfiles, public.mediciones, public.vivo, public.informes,
  public.posiciones, public.eventos, public.proyectos_meta
  to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function public.rol_actual() to authenticated;

-- ---------------------------------------------------------------- realtime
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mediciones') then
    alter publication supabase_realtime add table public.mediciones;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vivo') then
    alter publication supabase_realtime add table public.vivo;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'informes') then
    alter publication supabase_realtime add table public.informes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'eventos') then
    alter publication supabase_realtime add table public.eventos;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'proyectos_meta') then
    alter publication supabase_realtime add table public.proyectos_meta;
  end if;
end $$;

-- ============================================================================
-- PASO FINAL (despues de crear los usuarios en Authentication > Users):
-- cambia los correos por los tuyos y ejecuta estas lineas.
--
-- insert into public.perfiles (user_id, rol)
--   select id, 'celular' from auth.users where email = 'celular@tucorreo.com'
--   on conflict (user_id) do update set rol = excluded.rol;
-- insert into public.perfiles (user_id, rol)
--   select id, 'lector'  from auth.users where email = 'jefe@tucorreo.com'
--   on conflict (user_id) do update set rol = excluded.rol;
-- insert into public.perfiles (user_id, rol)
--   select id, 'admin'   from auth.users where email = 'felixffbl.26@gmail.com'
--   on conflict (user_id) do update set rol = excluded.rol;
-- ============================================================================
