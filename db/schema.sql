-- ════════════════════════════════════════════════════════════════════════
--  GEEKLEARN GAMES — schema.sql
--  Base de données des comptes (Supabase / Postgres).
--  ────────────────────────────────────────────────────────────────────────
--  À EXÉCUTER UNE SEULE FOIS :
--    Supabase Dashboard → SQL Editor → coller tout ce fichier → "Run".
--
--  Sécurité :
--    • Mots de passe + unicité email  → gérés par Supabase Auth (table auth.users).
--    • Profils protégés par RLS         → chaque membre ne voit/modifie que SES données.
--    • Unicité du pseudo                → index unique insensible à la casse.
-- ════════════════════════════════════════════════════════════════════════

-- ── Table des profils ───────────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null,
  gender        text check (gender in ('male','female','other')),
  gender_other  text,
  age           integer check (age >= 13 and age <= 120),
  -- Colonnes prêtes pour la suite (wishlist / préférences / avatar / bannière) :
  avatar_url    text,
  banner_url    text,
  wishlist      jsonb not null default '[]'::jsonb,
  prefs         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Unicité du pseudo, insensible à la casse ("Evan" == "evan")
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

-- ── Row Level Security ──────────────────────────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ── Disponibilité d'un pseudo (appelable même non connecté) ─────────────
-- SECURITY DEFINER : contourne RLS pour vérifier l'existence, sans exposer
-- la moindre donnée (ne retourne qu'un booléen).
create or replace function public.username_available(name text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(trim(name))
  );
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- ── Création auto du profil à l'inscription ─────────────────────────────
-- Lit les métadonnées passées par auth.signUp({ options:{ data:{...} } }).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, gender, gender_other, age)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || left(new.id::text, 8)),
    new.raw_user_meta_data->>'gender',
    new.raw_user_meta_data->>'gender_other',
    nullif(new.raw_user_meta_data->>'age','')::int
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Tenir updated_at à jour ─────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists profiles_touch_updated on public.profiles;
create trigger profiles_touch_updated
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ── Suppression de compte par l'utilisateur (droit à l'oubli, RGPD) ─────
-- Supprime la ligne auth.users → cascade sur profiles.
create or replace function public.delete_user()
returns void
language sql
security definer
set search_path = public, auth
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.delete_user() from public;
grant execute on function public.delete_user() to authenticated;

-- ── Filet de sécurité du formulaire de contact ──────────────────────────
-- Chaque message est aussi stocké ici → rien n'est perdu même si l'email échoue.
create table if not exists public.messages (
  id          bigint generated always as identity primary key,
  name        text,
  email       text,
  company     text,
  subject     text,
  body        text,
  portfolio   text,
  lang        text,
  created_at  timestamptz not null default now()
);

alter table public.messages enable row level security;

-- N'importe qui peut INSÉRER un message (formulaire public)…
drop policy if exists "messages_insert_public" on public.messages;
create policy "messages_insert_public" on public.messages
  for insert with check (true);

-- … mais PERSONNE ne peut les lire via l'API publique (lecture réservée au
-- Dashboard / service_role). Aucune policy SELECT = aucun accès en lecture.

-- ── Stockage des avatars personnalisés ──────────────────────────────────
-- Bucket public en lecture ; chaque utilisateur n'écrit que dans SON dossier
-- (préfixe = son user id). Les uploads passent par la modération côté app.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_write_own" on storage.objects;
create policy "avatars_write_own" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ════════════════════════════════════════════════════════════════════════
--  FIN. Après exécution : Project Settings → API → copier URL + anon key
--  dans js/config.js.
-- ════════════════════════════════════════════════════════════════════════
