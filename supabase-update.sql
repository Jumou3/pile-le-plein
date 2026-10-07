-- =====================================================================
-- PILE LE PLEIN — mise à jour : filtre de pseudos
-- À coller dans Supabase > SQL Editor > New query > Run
-- (pour un projet où supabase.sql a déjà été exécuté ; ne supprime rien)
-- =====================================================================

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

grant execute on function public.submit_score(uuid, text, int) to anon, authenticated;
