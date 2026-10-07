-- =====================================================================
-- PILE LE PLEIN — schéma Supabase
-- À coller tel quel dans Supabase > SQL Editor > New query > Run
-- =====================================================================

-- Une "run" = une partie démarrée. Sert à vérifier qu'un score
-- correspond à une durée de jeu plausible (anti-triche léger).
create table if not exists public.runs (
  id         uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  used       boolean not null default false
);

create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  pseudo     text not null check (char_length(pseudo) between 1 and 16),
  score      int  not null check (score between 1 and 60),
  created_at timestamptz not null default now()
);

create index if not exists scores_ranking_idx
  on public.scores (score desc, created_at asc);

-- Sécurité : lecture publique du classement, AUCUNE écriture directe.
alter table public.runs   enable row level security;
alter table public.scores enable row level security;

drop policy if exists "classement lisible par tous" on public.scores;
create policy "classement lisible par tous"
  on public.scores for select
  using (true);

revoke all on public.runs   from anon, authenticated;
revoke all on public.scores from anon, authenticated;
grant select on public.scores to anon, authenticated;

-- Filtre de pseudos : refuse les insultes courantes (accents, chiffres et symboles ignorés).
-- Ce n'est qu'un filet de base : tu peux toujours supprimer une ligne à la main
-- dans Table Editor > scores.
create or replace function public.pseudo_ok(p text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select regexp_replace(
           translate(lower(coalesce(p, '')), 'àâäáãéèêëíìîïóòôöõúùûüçñ0134578@$!|', 'aaaaaeeeeiiiiooooouuuucnoieastbasii'),
           '[^a-z]', '', 'g'
         ) !~ 'connard|connasse|salope|enculer|encule|putain|batard|bougnoule|youpin|nigger|nigga|pedophile|violeur|niquer|niquetamere|niquetoi|nazi|hitler|siegheil|fdp|ntm|kkk';
$$;

revoke execute on function public.pseudo_ok(text) from public, anon, authenticated;

-- Démarrer une partie -------------------------------------------------
create or replace function public.start_run()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  rid uuid;
begin
  insert into public.runs default values returning id into rid;
  return rid;
end;
$$;

-- Envoyer un score ----------------------------------------------------
-- Refuse : run inconnue ou déjà utilisée, score hors bornes,
-- score incompatible avec le temps écoulé (1,2 s minimum par manche).
create or replace function public.submit_score(
  p_run    uuid,
  p_pseudo text,
  p_score  int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r      public.runs%rowtype;
  clean  text := left(btrim(coalesce(p_pseudo, '')), 16);
begin
  if char_length(clean) < 1 then
    raise exception 'pseudo vide';
  end if;

  if not public.pseudo_ok(clean) then
    raise exception 'pseudo refusé';
  end if;

  if p_score < 1 or p_score > 60 then
    raise exception 'score invalide';
  end if;

  select * into r from public.runs where id = p_run for update;

  if not found or r.used then
    raise exception 'partie invalide';
  end if;

  if extract(epoch from (now() - r.started_at)) < p_score * 1.2 then
    raise exception 'score trop rapide';
  end if;

  update public.runs set used = true where id = p_run;
  insert into public.scores (pseudo, score) values (clean, p_score);
end;
$$;

grant execute on function public.start_run()                  to anon, authenticated;
grant execute on function public.submit_score(uuid, text, int) to anon, authenticated;

-- Ménage optionnel : supprimer les runs abandonnées de plus de 2 jours
-- (à lancer de temps en temps, ou via pg_cron si tu l'actives)
-- delete from public.runs where started_at < now() - interval '2 days';
