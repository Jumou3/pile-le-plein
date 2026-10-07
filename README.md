# Pile le plein

Un montant en euros s'affiche sur la pompe. On maintient appuyé (doigt, clic ou barre espace) pour faire le plein, on relâche pile dessus en regardant l'écran « Prix ». À chaque niveau, ça coule plus vite et la marge d'erreur se réduit. On démarre sans vie de rechange : un raté et c'est fini. Un **pile**, au centime exact (rarissime, environ 1 fois sur 25 au début), fait gagner une vie de rechange.

Site 100 % statique (HTML, CSS, JS, aucun build) + Supabase pour le classement public. Les sons sont synthétisés dans le navigateur, aucun fichier audio.

## Tester en local (sans rien configurer)

Ouvre `index.html` dans un navigateur. Tant que `config.js` est vide, le classement est local (stocké dans le navigateur).

## Mettre en ligne

### 1. Supabase (classement public)
1. Projet déjà créé ? Dans SQL Editor, colle `supabase-update.sql` et clique sur Run (ajoute le filtre de pseudos). Projet neuf : colle `supabase.sql` en entier.
2. `config.js` contient déjà l'URL et la clé publique du projet. Ne mets jamais une clé « secret » ou « service_role » dans ce fichier.

### 2. Hébergement
- **GitHub Pages** (gratuit, dépôt public) : crée un dépôt, importe tous les fichiers à la racine, puis Settings > Pages > Deploy from branch > `main` / root. L'adresse est de la forme `https://pseudo.github.io/nom-du-depot/`. Les mises à jour se font en important les fichiers modifiés, sur la même adresse.
- **Vercel Drop** (vercel.com/drop) : glisser-déposer du dossier ou du zip. Chaque dépôt crée un nouveau projet donc une nouvelle adresse. Le plan gratuit est réservé à un usage non commercial.

### 3. Aperçu de partage (WhatsApp, iMessage, Instagram…)
Dans `index.html`, remplace les deux occurrences de `SITE_URL_A_REMPLACER` par l'adresse finale du jeu, sans slash final (exemple : `https://pseudo.github.io/pile-le-plein`). L'image est `og.jpg` (1200 × 630 px). Tant que ce n'est pas fait, les liens partagés s'affichent sans image.

### 4. Vérifier
Joue une partie, réussis au moins un niveau, envoie un score : il doit apparaître dans Supabase > Table Editor > `scores`. Teste aussi un pseudo insultant : il doit être refusé.

## Règles du jeu (réglables dans `game.js`, objet `CFG`)

- `startLives`, `maxLives` : vies de rechange au départ (0) et plafond (5).
- `pileTol` : un « pile » est à ± ce montant de l'objectif. À 0 (réglage actuel), il faut tomber au centime exact. Pour faciliter, mets par exemple 0.03.
- `startSpeed`, `speedGrowth`, `maxSpeed` : débit de départ (en L/s ; 1,5 L/s = 3,3 €/s), accélération par niveau, plafond.
- `startTol`, `tolDecay`, `minTol` : marge d'erreur au départ (± €), resserrement par niveau, plancher.
- `targetMin`, `targetMaxBase`, `targetMaxStep`, `targetMaxCap` : fourchette des objectifs.
- `ppl` : prix au litre affiché (2,170 = moyenne nationale du SP95-E10 au 1er octobre 2026). Si tu le changes, ajuste `startSpeed` pour garder le même rythme en euros par seconde : `startSpeed × ppl` ≈ 3,3.
- `wobbleFrom` : niveau à partir duquel le débit devient irrégulier.

**Régler sans redéployer** : ajoute `?vitesse=0.5` à l'adresse du jeu pour tout ralentir de moitié, `?vitesse=2` pour doubler. Un bandeau jaune s'affiche et les scores ne sont jamais envoyés au classement dans ce mode.

Les textes du jeu sont dans l'objet `TEXTS`, juste au-dessus. Si tu changes `maxLevel`, change aussi les bornes `60` dans `supabase.sql`.

## La DA (images et polices)

- `assets/pump.webp` : la pompe de Robin (PNG fourni), nettoyée (fond blanc pur), recadrée à 814 × 1208 px.
- Les chiffres des écrans ne sont pas dans l'image : ils sont posés par-dessus, positionnés en % de l'image, donc ils suivent la taille de l'écran. La porte basse de la borne sert d'écran d'accueil (règles, bouton Jouer) puis de zone de messages en jeu.
- **Buse qui se débranche** : pas encore en place, il manque l'image de la même pompe avec le logement vide et la buse sortie. Dès qu'elle existe, elle s'ajoute comme l'ancienne.
- **Chiffres LCD** : DSEG7 Classic Bold Italic (licence libre OFL, `fonts/DSEG-LICENSE.txt`), étirés et affinés pour coller au rendu de Robin. DSEG n'a pas de virgule : elle vient de Barlow Bold Italic.
- **Textes** : Barlow (licence libre OFL) en remplacement provisoire de **DIN 2014**, qui est une police payante. Pour passer à DIN 2014 : licence web, puis un `@font-face` nommé `"DIN 2014"` dans `style.css` avec les fichiers woff2. Elle passe automatiquement devant Barlow.
- `og.jpg`, `icon-32.png`, `icon-180.png`, `icon-512.png` : image de partage et icônes, générées à partir de la pompe.

## Ce que la base accepte

Personne ne peut écrire dans les tables directement. Seules deux fonctions sont ouvertes :
- `start_run()` : appelée au premier appui d'une partie, renvoie un identifiant.
- `submit_score(run, pseudo, score)` : refuse l'identifiant inconnu ou déjà utilisé, un pseudo vide ou insultant, un score hors bornes, et un score trop rapide (moins de 1,2 s par niveau).

Ce n'est pas infaillible : quelqu'un de motivé peut encore envoyer un score plausible après avoir attendu, et le filtre de pseudos ne couvre que les insultes courantes. Pour supprimer une ligne à la main : Supabase > Table Editor > `scores`.
