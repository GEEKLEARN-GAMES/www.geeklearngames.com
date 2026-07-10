-- ════════════════════════════════════════════════════════════════════════
--  GEEKLEARN GAMES — schema.sql
--  Base de données des comptes (Supabase / Postgres).
--  ────────────────────────────────────────────────────────────────────────
--  IDEMPOTENT — RÉ-EXÉCUTER CE FICHIER EN ENTIER après chaque mise à jour
--  du schéma (chaque session qui ajoute colonnes/RPC/policies le signale) :
--    Supabase Dashboard → SQL Editor → coller tout ce fichier → "Run".
--
--  Sécurité :
--    • Mots de passe + unicité email  → gérés par Supabase Auth (table auth.users).
--    • Profils protégés par RLS         → chaque membre ne voit/modifie que SES données.
--    • Unicité du pseudo                → index unique insensible à la casse.
-- ════════════════════════════════════════════════════════════════════════

-- Les fonctions `language sql` (ex. public_profile) référencent des tables/
-- colonnes définies PLUS LOIN dans ce fichier : on désactive la validation
-- des corps à la création pour que le script passe aussi sur une base VIERGE.
set check_function_bodies = off;

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

-- ── Contraintes de format/longueur (défense en profondeur serveur) ──────────
-- La validation client (auth.js) est contournable via un appel direct à
-- l'API PostgREST : on impose donc les mêmes règles EN BASE. NOT VALID =
-- s'applique à toute écriture future sans bloquer un re-run sur données existantes.
alter table public.profiles add column if not exists bio text;  -- requis avant la contrainte bio ci-dessous
do $$
begin
  -- pseudo : 3–20 car., commence par alphanumérique, jeu de caractères sûr
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_fmt') then
    alter table public.profiles
      add constraint profiles_username_fmt
      check (username ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{2,19}$') not valid;
  end if;
  -- bio publique plafonnée
  if not exists (select 1 from pg_constraint where conname = 'profiles_bio_len') then
    alter table public.profiles
      add constraint profiles_bio_len
      check (bio is null or char_length(bio) <= 280) not valid;
  end if;
  -- avatar / bannière : longueur bornée + schéma sûr (data:image, https, blob, asset relatif)
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_url_chk') then
    alter table public.profiles
      add constraint profiles_avatar_url_chk
      check (avatar_url is null or (char_length(avatar_url) <= 4096
        and avatar_url ~* '^(data:image/(png|jpe?g|webp|gif|avif|svg\+xml);|https://|blob:|/|\./|assets/)'
        and avatar_url !~ '[\"''()<>\\`[:space:]]')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_banner_url_chk') then
    alter table public.profiles
      add constraint profiles_banner_url_chk
      check (banner_url is null or (char_length(banner_url) <= 4096
        and banner_url ~* '^(data:image/(png|jpe?g|webp|gif|avif|svg\+xml);|https://|blob:|/|\./|assets/)'
        and banner_url !~ '[\"''()<>\\`[:space:]]')) not valid;
  end if;
end $$;

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

-- ── Galerie de CAPTURES D'ÉCRAN du profil (style Steam) ─────────────────
-- Bucket public en lecture (les profils publics affichent la galerie) ;
-- chaque utilisateur n'écrit/supprime que dans SON dossier <uid>/shots/.
-- L'app compresse en WebP ≤1600px côté client avant upload (≤12 captures).
insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', true)
on conflict (id) do nothing;

drop policy if exists "shots_read" on storage.objects;
create policy "shots_read" on storage.objects
  for select using (bucket_id = 'screenshots');

drop policy if exists "shots_write_own" on storage.objects;
create policy "shots_write_own" on storage.objects
  for insert with check (
    bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "shots_update_own" on storage.objects;
create policy "shots_update_own" on storage.objects
  for update using (
    bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "shots_delete_own" on storage.objects;
create policy "shots_delete_own" on storage.objects
  for delete using (
    bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text
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
-- drop d'abord : CREATE OR REPLACE ne peut pas changer un type de retour (42P13)
drop function if exists public.search_users(text);
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
    -- Échappe les métacaractères LIKE (% et _) pour forcer une VRAIE recherche
    -- par préfixe et empêcher l'énumération élargie (q = '%' ou '_').
    and p.username ilike replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
  order by (p.username ilike replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_') escape '\') desc, p.username
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
-- drop d'abord : CREATE OR REPLACE ne peut pas changer un type de retour (42P13)
drop function if exists public.friends_list();
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

-- ── « Contacts qui y ont joué » (bibliothèque launcher, façon Steam) ─────
--  Mes amis (accepted) qui possèdent l'œuvre (library) OU l'ont lancée
--  (recent_games). Respecte prefs.privacy.showRecent : un ami qui masque
--  son activité de jeu n'apparaît pas du tout. mins = temps de jeu cumulé
--  sur l'œuvre (0 si possédée mais jamais lancée).
-- drop d'abord : CREATE OR REPLACE ne peut pas changer un type de retour (42P13)
drop function if exists public.friends_played(text);
create or replace function public.friends_played(work text)
returns table (id uuid, username text, avatar_url text, mins int)
language sql security definer set search_path = public as $$
  select p.id, p.username, p.avatar_url,
         coalesce((
           select (rg.e ->> 'mins')::int
           from jsonb_array_elements(coalesce(p.recent_games, '[]'::jsonb)) rg(e)
           where rg.e ->> 'id' = work
           limit 1
         ), 0) as mins
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where f.status = 'accepted'
    and auth.uid() in (f.requester, f.addressee)
    and coalesce(p.prefs #>> '{privacy,showRecent}', 'true') <> 'false'
    and (
      exists (select 1 from jsonb_array_elements(coalesce(p.library, '[]'::jsonb)) le(e)
              where le.e ->> 'id' = work)
      or exists (select 1 from jsonb_array_elements(coalesce(p.recent_games, '[]'::jsonb)) re(e)
                 where re.e ->> 'id' = work)
    )
  order by mins desc nulls last, p.username
  limit 24;
$$;
revoke all on function public.friends_played(text) from public;
grant execute on function public.friends_played(text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════
--  PROFIL PUBLIC d'un autre joueur (style Steam) — champs PUBLICS uniquement
--  ────────────────────────────────────────────────────────────────────────
--  SECURITY DEFINER : contourne RLS mais n'expose QUE des champs publics
--  (pseudo, avatar, bannière, bio, date d'inscription) + compteurs (trophées,
--  amis). JAMAIS d'email, âge, birthdate, genre ou autre donnée privée.
-- ════════════════════════════════════════════════════════════════════════
-- drop d'abord : CREATE OR REPLACE ne peut pas changer un type de retour (42P13)
drop function if exists public.public_profile(uuid);
create or replace function public.public_profile(uid uuid)
returns table (
  id uuid, username text, avatar_url text, banner_url text, bio text,
  created_at timestamptz, trophy_count bigint, friend_count bigint,
  wishlist jsonb, achievements text[], recent_games jsonb,
  games_count bigint, favorites jsonb
)
language sql security definer set search_path = public as $$
  select p.id, p.username, p.avatar_url, p.banner_url, p.bio, p.created_at,
         -- Trophées : comptés/servis SEULEMENT si prefs.privacy.showTrophies
         -- (avant : servis à tous malgré l'opt-out — incohérent avec le client).
         case when coalesce(p.prefs #>> '{privacy,showTrophies}', 'true') <> 'false'
              then (select count(*) from public.user_achievements ua where ua.user_id = p.id)
              else 0 end,
         (select count(*) from public.friendships f
            where f.status = 'accepted' and (f.requester = p.id or f.addressee = p.id)),
         -- Liste de souhaits : respecte prefs.privacy.showWishlist.
         case when coalesce(p.prefs #>> '{privacy,showWishlist}', 'true') <> 'false'
              then coalesce(p.wishlist, '[]'::jsonb) else '[]'::jsonb end,
         case when coalesce(p.prefs #>> '{privacy,showTrophies}', 'true') <> 'false'
              then coalesce((select array_agg(ua.ach_key) from public.user_achievements ua where ua.user_id = p.id), '{}')
              else '{}' end,
         -- Jeux récents : exposés SEULEMENT si le joueur n'a pas coupé
         -- "Afficher mon activité de jeu" (prefs.privacy.showRecent).
         case when coalesce(p.prefs #>> '{privacy,showRecent}', 'true') <> 'false'
              then coalesce(p.recent_games, '[]'::jsonb) else '[]'::jsonb end,
         -- Profil public v4 : nombre de jeux possédés (compteur seul, jamais
         -- la liste) + vitrine « Favoris » (ids d'œuvres publiques, coupable
         -- via prefs.privacy.showFavs — Options → Confidentialité).
         -- Favoris CLAMPÉS serveur (24) : prefs est écrit par le client, un
         -- client modifié ne doit pas gonfler le payload servi aux visiteurs.
         jsonb_array_length(coalesce(p.library, '[]'::jsonb))::bigint,
         case when coalesce(p.prefs #>> '{privacy,showFavs}', 'true') <> 'false'
               and jsonb_typeof(p.prefs -> 'favs') = 'array'
              then (select coalesce(jsonb_agg(s.v), '[]'::jsonb)
                      from (select value as v from jsonb_array_elements(p.prefs -> 'favs') limit 24) s)
              else '[]'::jsonb end
  from public.profiles p
  where p.id = uid;
$$;
revoke all on function public.public_profile(uuid) from public;
grant execute on function public.public_profile(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════
--  JEUX RÉCENTS (activité de jeu, style Steam/PSN) — sessions RÉELLES
--  ────────────────────────────────────────────────────────────────────────
--  Le JEU (ou le launcher) appelle touch_recent_game('backrooms-liminal', 37)
--  à la fin d'une session (minutes jouées, ≤24h par appel). Stockage compact
--  dans profiles.recent_games : [{id, at, mins}] trié récent→ancien, ≤10
--  entrées, minutes cumulées par jeu. Ids validés (slug), auth obligatoire.
-- ════════════════════════════════════════════════════════════════════════
alter table public.profiles add column if not exists recent_games jsonb not null default '[]'::jsonb;

create or replace function public.touch_recent_game(p_game text, p_minutes int default 0)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cur jsonb;
  prev_mins int;
  entry jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_game is null or length(p_game) > 64 or p_game !~ '^[a-z0-9][a-z0-9-]*$' then
    raise exception 'bad_game';
  end if;
  if p_minutes is null or p_minutes < 0 then p_minutes := 0; end if;
  if p_minutes > 1440 then p_minutes := 1440; end if;

  select coalesce(recent_games, '[]'::jsonb) into cur from public.profiles where id = uid;
  select coalesce((e->>'mins')::int, 0) into prev_mins
    from jsonb_array_elements(cur) e where e->>'id' = p_game limit 1;
  entry := jsonb_build_object(
    'id', p_game,
    'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'mins', coalesce(prev_mins, 0) + p_minutes
  );
  -- retire l'ancienne entrée du jeu, insère la nouvelle en tête, cap à 10
  cur := coalesce(
    (select jsonb_agg(e) from jsonb_array_elements(cur) e where e->>'id' <> p_game),
    '[]'::jsonb
  );
  cur := jsonb_insert(cur, '{0}', entry);
  if jsonb_array_length(cur) > 10 then
    cur := (select jsonb_agg(e) from (
      select e from jsonb_array_elements(cur) with ordinality t(e, i) where i <= 10
    ) s);
  end if;
  update public.profiles set recent_games = cur where id = uid;
end $$;
revoke all on function public.touch_recent_game(text, int) from public;
grant execute on function public.touch_recent_game(text, int) to authenticated;

-- ════════════════════════════════════════════════════════════════════════
--  BIBLIOTHÈQUE (jeux possédés, façon Steam/Rockstar) — achats RÉELS
--  ────────────────────────────────────────────────────────────────────────
--  profiles.library : [{id, platform, at}] — alimentée par grant_game() au
--  moment de l'achat. Comme grant_achievement : en production, l'appel doit
--  venir du backend de paiement (idéalement service_role anti-triche) ;
--  l'RPC authenticated permet les tests et l'import self-service en attendant.
-- ════════════════════════════════════════════════════════════════════════
alter table public.profiles add column if not exists library jsonb not null default '[]'::jsonb;

create or replace function public.grant_game(p_game text, p_platform text default 'glg')
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cur jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_game is null or length(p_game) > 64 or p_game !~ '^[a-z0-9][a-z0-9-]*$' then
    raise exception 'bad_game';
  end if;
  if p_platform is null or p_platform !~ '^[a-z0-9_-]{1,16}$' then p_platform := 'glg'; end if;

  select coalesce(library, '[]'::jsonb) into cur from public.profiles where id = uid;
  -- déjà possédé → no-op (idempotent)
  if exists (select 1 from jsonb_array_elements(cur) e where e->>'id' = p_game) then return; end if;
  cur := cur || jsonb_build_array(jsonb_build_object(
    'id', p_game, 'platform', p_platform,
    'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ));
  update public.profiles set library = cur where id = uid;
end $$;
revoke all on function public.grant_game(text, text) from public;
grant execute on function public.grant_game(text, text) to authenticated;

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

-- (colonne bio : déjà ajoutée en tête de fichier, avant sa contrainte CHECK)

-- ════════════════════════════════════════════════════════════════════════
--  ÉVALUATIONS (style Steam) — 1 avis max par joueur et par œuvre
--  ────────────────────────────────────────────────────────────────────────
--  Note 1–5 + texte optionnel ≤1200. Éditable par l'auteur, publique.
--  Lecture TOUJOURS via RPC (jointure pseudo/avatar sans exposer profiles).
--  Modération : signalements communautaires → auto-masquage à 5, revue
--  finale via le Dashboard Supabase (filtre hidden/report_count).
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.reviews (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  work_id      text not null,
  rating       int  not null check (rating between 1 and 5),
  body         text check (body is null or char_length(body) <= 1200),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  hidden       boolean not null default false,
  report_count int not null default 0,
  primary key (user_id, work_id)
);
create index if not exists reviews_work_idx on public.reviews (work_id) where not hidden;
alter table public.reviews enable row level security;

drop policy if exists "reviews_select_visible" on public.reviews;
create policy "reviews_select_visible" on public.reviews
  for select using (not hidden or auth.uid() = user_id);
drop policy if exists "reviews_delete_own" on public.reviews;
create policy "reviews_delete_own" on public.reviews
  for delete using (auth.uid() = user_id);
-- Pas de policy INSERT/UPDATE : l'écriture passe UNIQUEMENT par upsert_review
-- (rate-limit serveur + caps imposés, non contournables via PostgREST).

drop trigger if exists reviews_touch on public.reviews;
create trigger reviews_touch before update on public.reviews
  for each row execute function public.touch_updated_at();

-- Écriture contrôlée : upsert + rate-limit 10 nouvelles évals / 24 h
create or replace function public.upsert_review(wid text, r int, b text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return 'notAuth'; end if;
  if r is null or r not between 1 and 5 then return 'badRating'; end if;
  if wid is null or length(wid) > 64 then return 'badWork'; end if;
  if (select count(*) from public.reviews
      where user_id = auth.uid() and created_at > now() - interval '24 hours') >= 10
     and not exists (select 1 from public.reviews where user_id = auth.uid() and work_id = wid)
  then return 'limit'; end if;
  insert into public.reviews (user_id, work_id, rating, body)
  values (auth.uid(), wid, r, nullif(left(coalesce(b,''), 1200), ''))
  on conflict (user_id, work_id)
  do update set rating = excluded.rating, body = excluded.body, updated_at = now()
  where not reviews.hidden;
  return 'ok';
end; $$;
revoke all on function public.upsert_review(text,int,text) from public;
grant execute on function public.upsert_review(text,int,text) to authenticated;

-- Suppression de SA propre évaluation (retour explicite pour l'UI)
create or replace function public.delete_review(wid text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return 'notAuth'; end if;
  delete from public.reviews where user_id = auth.uid() and work_id = wid;
  return 'ok';
end; $$;
revoke all on function public.delete_review(text) from public;
grant execute on function public.delete_review(text) to authenticated;

-- Agrégat pour les fiches (nb, moyenne, histogramme) — visible par tous
-- drop d'abord : CREATE OR REPLACE ne peut pas changer un type de retour (42P13)
drop function if exists public.review_summary(text);
create or replace function public.review_summary(wid text)
returns table (cnt bigint, avg_rating numeric, histo jsonb)
language sql stable security definer set search_path = public as $$
  with s as (
    select rating, count(*)::bigint n from public.reviews
    where work_id = wid and not hidden group by rating
  )
  select coalesce(sum(n),0)::bigint,
         round(sum(rating * n)::numeric / nullif(sum(n),0), 2),
         coalesce(jsonb_object_agg(rating::text, n), '{}'::jsonb)
  from s;
$$;
revoke all on function public.review_summary(text) from public;
grant execute on function public.review_summary(text) to anon, authenticated;

-- Liste paginée d'une œuvre, avec pseudo/avatar (jamais la table en direct)
-- drop d'abord : CREATE OR REPLACE ne peut pas changer un type de retour (42P13)
drop function if exists public.work_reviews(text, int, int);
create or replace function public.work_reviews(wid text, lim int default 10, off int default 0)
returns table (user_id uuid, username text, avatar_url text, rating int, body text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.user_id, p.username, p.avatar_url, r.rating, r.body, r.updated_at
  from public.reviews r join public.profiles p on p.id = r.user_id
  where r.work_id = wid and not r.hidden
  order by r.updated_at desc
  limit least(coalesce(lim,10), 25) offset greatest(coalesce(off,0), 0);
$$;
revoke all on function public.work_reviews(text,int,int) from public;
grant execute on function public.work_reviews(text,int,int) to anon, authenticated;

-- Évaluations rédigées par UN joueur (section profil, style Steam)
-- drop d'abord : CREATE OR REPLACE ne peut pas changer un type de retour (42P13)
drop function if exists public.user_reviews(uuid);
create or replace function public.user_reviews(uid uuid)
returns table (work_id text, rating int, body text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.work_id, r.rating, r.body, r.updated_at from public.reviews r
  where r.user_id = uid and not r.hidden
  order by r.updated_at desc limit 50;
$$;
revoke all on function public.user_reviews(uuid) from public;
grant execute on function public.user_reviews(uuid) to anon, authenticated;

-- Signalement communautaire : auto-masquage à 5 signalements distincts
create table if not exists public.review_reports (
  reporter    uuid not null references public.profiles (id) on delete cascade,
  review_user uuid not null,
  review_work text not null,
  created_at  timestamptz not null default now(),
  primary key (reporter, review_user, review_work)
);
alter table public.review_reports enable row level security;
-- Aucune policy = lecture/écriture directes impossibles ; passage par la RPC.

create or replace function public.report_review(ruser uuid, rwork text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or auth.uid() = ruser then return 'no'; end if;
  insert into public.review_reports (reporter, review_user, review_work)
  values (auth.uid(), ruser, rwork) on conflict do nothing;
  if found then
    update public.reviews
      set report_count = report_count + 1,
          hidden = (report_count + 1 >= 5)
      where user_id = ruser and work_id = rwork;
  end if;
  return 'ok';
end; $$;
revoke all on function public.report_review(uuid,text) from public;
grant execute on function public.report_review(uuid,text) to authenticated;

-- ── Preuve sociale : nb de joueurs ayant une œuvre en wishlist ───────────
create or replace function public.wishlist_count(work text)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.profiles where wishlist ? work;
$$;
revoke all on function public.wishlist_count(text) from public;
grant execute on function public.wishlist_count(text) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
--  RARETÉ DES TROPHÉES (signature PSN : "ULTRA RARE 4,2 %")
--  Agrégats anonymes uniquement (aucune donnée personnelle) → exposable à anon.
--  Dénominateur = joueurs ayant ≥1 trophée DANS CE JEU (comme PSN).
-- ════════════════════════════════════════════════════════════════════════
create index if not exists ua_ach_key_idx on public.user_achievements (ach_key);

-- drop d'abord : CREATE OR REPLACE ne peut pas changer un type de retour (42P13)
drop function if exists public.trophy_rarity(text);
create or replace function public.trophy_rarity(game text)
returns table (ach_key text, owners bigint, pct numeric, players bigint)
language sql stable security definer set search_path = public as $$
  with players as (
    select count(distinct ua.user_id) n from public.user_achievements ua
    where split_part(ua.ach_key, '/', 1) = game
  )
  select ua.ach_key,
         count(*)::bigint,
         round(count(*)::numeric * 100 / greatest((select n from players), 1), 1),
         (select n from players)
  from public.user_achievements ua
  where split_part(ua.ach_key, '/', 1) = game
  group by ua.ach_key;
$$;
revoke all on function public.trophy_rarity(text) from public;
grant execute on function public.trophy_rarity(text) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
--  TEMPS RÉEL — notifications d'amis live (postgres_changes)
--  RLS s'applique déjà (friendships_select_mine) : chacun ne reçoit que
--  les événements de SES relations.
-- ════════════════════════════════════════════════════════════════════════
do $$ begin
  alter publication supabase_realtime add table public.friendships;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ════════════════════════════════════════════════════════════════════════
--  GLG CHAT — messagerie (MP entre amis + groupes « serveurs »)
--  ────────────────────────────────────────────────────────────────────────
--  Canaux : 'dm:<uuidA>:<uuidB>' (uuid TRIÉS — clé stable du duo, amis
--  acceptés uniquement) et 'g:<group_id>' (membres uniquement).
--  Sécurité : chat_can_access() centralise l'autorisation ; RLS partout ;
--  anti-spam par trigger (20 messages / 10 s). Pièces jointes : bucket
--  public `chat-media`, écriture limitée au dossier de l'expéditeur.
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.chat_groups (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(name) between 1 and 60),
  owner       uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create table if not exists public.chat_members (
  group_id    bigint not null references public.chat_groups (id) on delete cascade,
  user_id     uuid   not null references public.profiles (id) on delete cascade,
  role        text   not null default 'member' check (role in ('owner','member')),
  joined_at   timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists chat_members_user_idx on public.chat_members (user_id);
create table if not exists public.chat_messages (
  id          bigint generated always as identity primary key,
  channel     text not null check (channel ~ '^(dm:[0-9a-f-]{36}:[0-9a-f-]{36}|g:[0-9]+)$'),
  sender      uuid not null references public.profiles (id) on delete cascade,
  body        text check (body is null or char_length(body) <= 4000),
  attachment  jsonb,   -- {kind:'image|video|audio|file', url, name, size, mime}
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  constraint chat_messages_not_empty check (body is not null or attachment is not null)
);
create index if not exists chat_messages_channel_idx on public.chat_messages (channel, id desc);
create table if not exists public.chat_reads (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  channel    text not null,
  last_read  timestamptz not null default now(),
  primary key (user_id, channel)
);

-- ── Autorisation d'accès à un canal (DÉFINITION UNIQUE de la règle) ──────
create or replace function public.chat_can_access(ch text, uid uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare a uuid; b uuid; gid bigint;
begin
  if uid is null then return false; end if;
  if ch like 'dm:%' then
    a := split_part(ch, ':', 2)::uuid;
    b := split_part(ch, ':', 3)::uuid;
    if a >= b then return false; end if;          -- clé canonique : uuid triés
    if uid <> a and uid <> b then return false; end if;
    return exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a)));
  elsif ch like 'g:%' then
    gid := split_part(ch, ':', 2)::bigint;
    return exists (select 1 from public.chat_members m where m.group_id = gid and m.user_id = uid);
  end if;
  return false;
exception when others then return false;
end; $$;
revoke all on function public.chat_can_access(text, uuid) from public;
grant execute on function public.chat_can_access(text, uuid) to authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.chat_groups   enable row level security;
alter table public.chat_members  enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reads    enable row level security;

drop policy if exists "chat_groups_select_member" on public.chat_groups;
create policy "chat_groups_select_member" on public.chat_groups
  for select using (exists (select 1 from public.chat_members m
                            where m.group_id = id and m.user_id = auth.uid()));

drop policy if exists "chat_members_select_same_group" on public.chat_members;
create policy "chat_members_select_same_group" on public.chat_members
  for select using (user_id = auth.uid() or exists (
    select 1 from public.chat_members me
    where me.group_id = chat_members.group_id and me.user_id = auth.uid()));

drop policy if exists "chat_messages_select_access" on public.chat_messages;
create policy "chat_messages_select_access" on public.chat_messages
  for select using (public.chat_can_access(channel, auth.uid()));
drop policy if exists "chat_messages_insert_own" on public.chat_messages;
create policy "chat_messages_insert_own" on public.chat_messages
  for insert with check (sender = auth.uid() and public.chat_can_access(channel, auth.uid()));
drop policy if exists "chat_messages_update_own" on public.chat_messages;
create policy "chat_messages_update_own" on public.chat_messages
  for update using (sender = auth.uid())
  with check (sender = auth.uid() and public.chat_can_access(channel, auth.uid()));
drop policy if exists "chat_messages_delete_own" on public.chat_messages;
create policy "chat_messages_delete_own" on public.chat_messages
  for delete using (sender = auth.uid());

drop policy if exists "chat_reads_own" on public.chat_reads;
create policy "chat_reads_own" on public.chat_reads
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Anti-spam : 20 messages / 10 secondes par expéditeur ─────────────────
create or replace function public.chat_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.chat_messages
      where sender = new.sender and created_at > now() - interval '10 seconds') >= 20 then
    raise exception 'rate';
  end if;
  return new;
end; $$;
drop trigger if exists chat_messages_rate on public.chat_messages;
create trigger chat_messages_rate before insert on public.chat_messages
  for each row execute function public.chat_rate_limit();

-- ── Groupes : création / ajout / départ (RPC — jamais d'insert direct) ───
create or replace function public.chat_group_create(gname text, members uuid[])
returns bigint language plpgsql security definer set search_path = public as $$
declare gid bigint; m uuid;
begin
  if auth.uid() is null then raise exception 'notAuth'; end if;
  if char_length(trim(gname)) < 1 then raise exception 'badName'; end if;
  if (select count(*) from public.chat_groups where owner = auth.uid()) >= 20 then
    raise exception 'limit';
  end if;
  insert into public.chat_groups (name, owner) values (trim(gname), auth.uid()) returning id into gid;
  insert into public.chat_members (group_id, user_id, role) values (gid, auth.uid(), 'owner');
  foreach m in array coalesce(members, '{}') loop
    -- seuls des AMIS acceptés du créateur peuvent être embarqués (32 max)
    if m <> auth.uid()
       and (select count(*) from public.chat_members where group_id = gid) < 32
       and exists (select 1 from public.friendships f where f.status = 'accepted'
                   and ((f.requester = auth.uid() and f.addressee = m)
                     or (f.requester = m and f.addressee = auth.uid()))) then
      insert into public.chat_members (group_id, user_id) values (gid, m)
      on conflict do nothing;
    end if;
  end loop;
  return gid;
end; $$;
revoke all on function public.chat_group_create(text, uuid[]) from public;
grant execute on function public.chat_group_create(text, uuid[]) to authenticated;

create or replace function public.chat_group_add(gid bigint, target uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.chat_members
                 where group_id = gid and user_id = auth.uid()) then return 'notMember'; end if;
  if (select count(*) from public.chat_members where group_id = gid) >= 32 then return 'full'; end if;
  if not exists (select 1 from public.friendships f where f.status = 'accepted'
                 and ((f.requester = auth.uid() and f.addressee = target)
                   or (f.requester = target and f.addressee = auth.uid()))) then return 'notFriend'; end if;
  insert into public.chat_members (group_id, user_id) values (gid, target)
  on conflict do nothing;
  return 'ok';
end; $$;
revoke all on function public.chat_group_add(bigint, uuid) from public;
grant execute on function public.chat_group_add(bigint, uuid) to authenticated;

create or replace function public.chat_group_leave(gid bigint)
returns text language plpgsql security definer set search_path = public as $$
declare next_owner uuid;
begin
  delete from public.chat_members where group_id = gid and user_id = auth.uid();
  if not exists (select 1 from public.chat_members where group_id = gid) then
    delete from public.chat_groups where id = gid;                       -- groupe vide → supprimé
  elsif exists (select 1 from public.chat_groups where id = gid and owner = auth.uid()) then
    select user_id into next_owner from public.chat_members
      where group_id = gid order by joined_at limit 1;                    -- transfert au plus ancien
    update public.chat_groups set owner = next_owner where id = gid;
    update public.chat_members set role = 'owner' where group_id = gid and user_id = next_owner;
  end if;
  return 'ok';
end; $$;
revoke all on function public.chat_group_leave(bigint) from public;
grant execute on function public.chat_group_leave(bigint) to authenticated;

-- ── Inbox : toutes MES conversations + dernier message + non-lus ─────────
-- drop d'abord : CREATE OR REPLACE ne peut pas changer un type de retour (42P13)
drop function if exists public.chat_channels();
create or replace function public.chat_channels()
returns table (channel text, kind text, gid bigint, name text, avatar_url text,
               other_id uuid, members int, last_body text, last_attach_kind text,
               last_sender uuid, last_at timestamptz, unread int)
language sql security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  dms as (
    select 'dm:' || least(p.id, (select uid from me))::text || ':' || greatest(p.id, (select uid from me))::text as channel,
           'dm'::text as kind, null::bigint as gid,
           p.username as name, p.avatar_url, p.id as other_id, 2 as members
    from public.friendships f
    join public.profiles p on p.id = case when f.requester = (select uid from me) then f.addressee else f.requester end
    where f.status = 'accepted' and (select uid from me) in (f.requester, f.addressee)
  ),
  grps as (
    select 'g:' || g.id::text as channel, 'group'::text as kind, g.id as gid,
           g.name, null::text as avatar_url, null::uuid as other_id,
           (select count(*)::int from public.chat_members m2 where m2.group_id = g.id) as members
    from public.chat_groups g
    join public.chat_members m on m.group_id = g.id and m.user_id = (select uid from me)
  ),
  chans as (select * from dms union all select * from grps)
  select c.channel, c.kind, c.gid, c.name, c.avatar_url, c.other_id, c.members,
         lm.body, lm.attachment ->> 'kind', lm.sender, lm.created_at,
         coalesce((select count(*)::int from public.chat_messages cm
                   where cm.channel = c.channel
                     and cm.sender <> (select uid from me)
                     and cm.created_at > coalesce((select r.last_read from public.chat_reads r
                                                   where r.user_id = (select uid from me)
                                                     and r.channel = c.channel), 'epoch'::timestamptz)), 0)
  from chans c
  left join lateral (select body, attachment, sender, created_at
                     from public.chat_messages where channel = c.channel
                     order by id desc limit 1) lm on true
  order by lm.created_at desc nulls last, c.name;
$$;
revoke all on function public.chat_channels() from public;
grant execute on function public.chat_channels() to authenticated;

-- ── Marquer lu ────────────────────────────────────────────────────────────
create or replace function public.chat_mark_read(ch text)
returns void language sql security definer set search_path = public as $$
  insert into public.chat_reads (user_id, channel, last_read)
  select auth.uid(), ch, now()
  where public.chat_can_access(ch, auth.uid())
  on conflict (user_id, channel) do update set last_read = now();
$$;
revoke all on function public.chat_mark_read(text) from public;
grant execute on function public.chat_mark_read(text) to authenticated;

-- ── Pièces jointes : bucket public `chat-media` (25 Mo max) ──────────────
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;
drop policy if exists "chatmedia_read" on storage.objects;
create policy "chatmedia_read" on storage.objects
  for select using (bucket_id = 'chat-media');
drop policy if exists "chatmedia_write_own" on storage.objects;
create policy "chatmedia_write_own" on storage.objects
  for insert with check (
    bucket_id = 'chat-media' and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "chatmedia_delete_own" on storage.objects;
create policy "chatmedia_delete_own" on storage.objects
  for delete using (
    bucket_id = 'chat-media' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── Réactions émoji (toggle par joueur, façon Discord) ───────────────────
--  reactions = { "👍": [uid, uid…], … } — modifiées UNIQUEMENT via la RPC
--  (la policy UPDATE n'autorise que l'expéditeur ; la RPC security definer
--  vérifie l'accès au canal). 12 émojis distincts max, 40 votants par émoji.
alter table public.chat_messages add column if not exists reactions jsonb not null default '{}'::jsonb;
create or replace function public.chat_react(mid bigint, emo text)
returns text language plpgsql security definer set search_path = public as $$
declare m record; arr jsonb; uid text := auth.uid()::text;
begin
  if auth.uid() is null then return 'notAuth'; end if;
  if emo is null or char_length(emo) < 1 or char_length(emo) > 16 then return 'badEmoji'; end if;
  select * into m from public.chat_messages where id = mid;
  if not found or not public.chat_can_access(m.channel, auth.uid()) then return 'forbidden'; end if;
  arr := coalesce(m.reactions -> emo, '[]'::jsonb);
  if arr ? uid then
    select coalesce(jsonb_agg(x), '[]'::jsonb) into arr
      from jsonb_array_elements_text(arr) t(x) where x <> uid;
  else
    if not (m.reactions ? emo) and (select count(*) from jsonb_object_keys(m.reactions)) >= 12 then return 'full'; end if;
    if jsonb_array_length(arr) >= 40 then return 'full'; end if;
    arr := arr || to_jsonb(uid);
  end if;
  if jsonb_array_length(arr) = 0 then
    update public.chat_messages set reactions = m.reactions - emo where id = mid;
  else
    update public.chat_messages set reactions = jsonb_set(m.reactions, array[emo], arr) where id = mid;
  end if;
  return 'ok';
end; $$;
revoke all on function public.chat_react(bigint, text) from public;
grant execute on function public.chat_react(bigint, text) to authenticated;

-- ── Temps réel : messages live (RLS s'applique aux événements) ───────────
do $$ begin
  alter publication supabase_realtime add table public.chat_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ════════════════════════════════════════════════════════════════════════
--  FIN. Après exécution : Project Settings → API → copier URL + anon key
--  dans js/config.js.
-- ════════════════════════════════════════════════════════════════════════
