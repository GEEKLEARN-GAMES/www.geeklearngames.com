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
  birthdate     date,                                   -- source de vérité pour l'âge (gating 18+)
  age           integer check (age >= 13 and age <= 120),
  -- Colonnes prêtes pour la suite (wishlist / préférences / avatar / bannière) :
  avatar_url    text,
  banner_url    text,
  wishlist      jsonb not null default '[]'::jsonb,
  prefs         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Idempotent : ajoute la colonne si la table existait déjà (re-run du script)
alter table public.profiles add column if not exists birthdate date;

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
  insert into public.profiles (id, username, gender, gender_other, age, birthdate)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || left(new.id::text, 8)),
    new.raw_user_meta_data->>'gender',
    new.raw_user_meta_data->>'gender_other',
    nullif(new.raw_user_meta_data->>'age','')::int,
    nullif(new.raw_user_meta_data->>'birthdate','')::date
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
--  AMIS / CONTACTS  (style Steam/Epic) — sécurisé par RLS + RPC SECURITY DEFINER
--  ────────────────────────────────────────────────────────────────────────
--  Modèle : une ligne par relation (requester → addressee).
--    status 'pending'  = demande envoyée, pas encore acceptée
--    status 'accepted' = amis
--  Aucune donnée privée (email, âge, date de naissance) n'est jamais exposée :
--  les RPC ne renvoient QUE { id, username, avatar_url, relation }.
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.friendships (
  id          bigint generated always as identity primary key,
  requester   uuid not null references public.profiles (id) on delete cascade,
  addressee   uuid not null references public.profiles (id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','accepted')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint friendships_no_self check (requester <> addressee),
  constraint friendships_unique  unique (requester, addressee)
);
create index if not exists friendships_addressee_idx on public.friendships (addressee);
create index if not exists friendships_requester_idx on public.friendships (requester);

alter table public.friendships enable row level security;

-- Lecture : uniquement les relations où JE suis impliqué (mutations = RPC ci-dessous)
drop policy if exists "friendships_select_mine" on public.friendships;
create policy "friendships_select_mine" on public.friendships
  for select using (auth.uid() = requester or auth.uid() = addressee);

drop trigger if exists friendships_touch on public.friendships;
create trigger friendships_touch before update on public.friendships
  for each row execute function public.touch_updated_at();

-- ── Recherche d'utilisateurs (pseudo + avatar + relation seulement) ──────
create or replace function public.search_users(q text)
returns table (id uuid, username text, avatar_url text, relation text)
language sql security definer set search_path = public as $$
  select p.id, p.username, p.avatar_url,
    case
      when f1.status = 'accepted' or f2.status = 'accepted' then 'friends'
      when f1.status = 'pending' then 'outgoing'
      when f2.status = 'pending' then 'incoming'
      else 'none'
    end as relation
  from public.profiles p
  left join public.friendships f1 on f1.requester = auth.uid() and f1.addressee = p.id
  left join public.friendships f2 on f2.requester = p.id and f2.addressee = auth.uid()
  where p.id <> auth.uid()
    and length(trim(q)) >= 2
    and p.username ilike trim(q) || '%'
  order by (p.username ilike trim(q)) desc, p.username
  limit 12;
$$;
revoke all on function public.search_users(text) from public;
grant execute on function public.search_users(text) to authenticated;

-- ── Envoyer une demande (auto-accept si l'autre m'a déjà invité) ─────────
create or replace function public.friend_request(target uuid)
returns text language plpgsql security definer set search_path = public as $$
declare existing record; out_count int;
begin
  if target = auth.uid() then return 'self'; end if;
  if not exists (select 1 from public.profiles where id = target) then return 'notfound'; end if;
  select * into existing from public.friendships
    where (requester = auth.uid() and addressee = target)
       or (requester = target and addressee = auth.uid())
    limit 1;
  if found then
    if existing.status = 'accepted' then return 'friends'; end if;
    if existing.requester = target and existing.status = 'pending' then
      update public.friendships set status = 'accepted' where id = existing.id;
      return 'friends';
    end if;
    return 'outgoing';
  end if;
  select count(*) into out_count from public.friendships
    where requester = auth.uid() and status = 'pending';
  if out_count >= 200 then return 'limit'; end if;   -- garde-fou anti-spam
  insert into public.friendships (requester, addressee, status)
    values (auth.uid(), target, 'pending');
  return 'outgoing';
end; $$;
revoke all on function public.friend_request(uuid) from public;
grant execute on function public.friend_request(uuid) to authenticated;

-- ── Répondre à une demande entrante ──────────────────────────────────────
create or replace function public.friend_respond(other uuid, accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare existing record;
begin
  select * into existing from public.friendships
    where requester = other and addressee = auth.uid() and status = 'pending' limit 1;
  if not found then return 'notfound'; end if;
  if accept then
    update public.friendships set status = 'accepted' where id = existing.id;
    return 'friends';
  else
    delete from public.friendships where id = existing.id;
    return 'declined';
  end if;
end; $$;
revoke all on function public.friend_respond(uuid, boolean) from public;
grant execute on function public.friend_respond(uuid, boolean) to authenticated;

-- ── Retirer un ami / annuler une demande ─────────────────────────────────
create or replace function public.friend_remove(other uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  delete from public.friendships
    where (requester = auth.uid() and addressee = other)
       or (requester = other and addressee = auth.uid());
  return 'removed';
end; $$;
revoke all on function public.friend_remove(uuid) from public;
grant execute on function public.friend_remove(uuid) to authenticated;

-- ── Liste : amis + demandes entrantes/sortantes (pseudo + avatar) ────────
create or replace function public.friends_list()
returns table (friendship_id bigint, other_id uuid, username text, avatar_url text, kind text, since timestamptz)
language sql security definer set search_path = public as $$
  select f.id,
         p.id,
         p.username,
         p.avatar_url,
         case
           when f.status = 'accepted'        then 'friend'
           when f.requester = auth.uid()     then 'outgoing'
           else 'incoming'
         end as kind,
         f.updated_at
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where auth.uid() in (f.requester, f.addressee)
  order by (f.status = 'pending' and f.addressee = auth.uid()) desc, f.updated_at desc;
$$;
revoke all on function public.friends_list() from public;
grant execute on function public.friends_list() to authenticated;

-- ════════════════════════════════════════════════════════════════════════
--  TROPHÉES / SUCCÈS  (style PlayStation) — déblocages RÉELS
--  ────────────────────────────────────────────────────────────────────────
--  Les DÉFINITIONS de trophées vivent côté site (js/data.js → TROPHIES).
--  Ici on ne stocke que les DÉBLOCAGES d'un utilisateur, protégés par RLS.
--  En production, c'est le JEU (contexte de confiance) qui appelle
--  grant_achievement() — idéalement via service_role pour empêcher la triche.
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.user_achievements (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  ach_key     text not null,                       -- "<game_id>/<code>"
  unlocked_at timestamptz not null default now(),
  primary key (user_id, ach_key)
);
alter table public.user_achievements enable row level security;

drop policy if exists "ua_select_own" on public.user_achievements;
create policy "ua_select_own" on public.user_achievements
  for select using (auth.uid() = user_id);
drop policy if exists "ua_insert_own" on public.user_achievements;
create policy "ua_insert_own" on public.user_achievements
  for insert with check (auth.uid() = user_id);
drop policy if exists "ua_delete_own" on public.user_achievements;
create policy "ua_delete_own" on public.user_achievements
  for delete using (auth.uid() = user_id);

create or replace function public.grant_achievement(game text, code text)
returns void language sql security definer set search_path = public as $$
  insert into public.user_achievements (user_id, ach_key)
  values (auth.uid(), game || '/' || code)
  on conflict do nothing;
$$;
revoke all on function public.grant_achievement(text, text) from public;
grant execute on function public.grant_achievement(text, text) to authenticated;

-- ── COMPTES LIÉS (Steam / Epic / PlayStation) ───────────────────────────
-- Stockés sur le profil. MVP = identifiant saisi par l'utilisateur ; l'import
-- d'amis live nécessite les API officielles + OAuth côté serveur (clés secrètes).
alter table public.profiles add column if not exists linked_accounts jsonb not null default '{}'::jsonb;

-- ════════════════════════════════════════════════════════════════════════
--  FIN. Après exécution : Project Settings → API → copier URL + anon key
--  dans js/config.js.
-- ════════════════════════════════════════════════════════════════════════
