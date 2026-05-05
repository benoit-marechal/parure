# QCD — Parure

## Objectif

Mettre en ligne **ce soir** une mini-SPA gratuite (GitHub Pages) qui :

1. **Anonymise** un fichier de configuration : remplace les *valeurs* par des noms de variables auto-générés (les *clés* restent intactes), et produit deux fichiers en sortie :
   - le fichier de config templaté
   - le fichier de correspondance `nom_de_variable → valeur_originale`
2. **Restaure** : à partir d'un fichier templaté + d'un fichier de correspondance, reconstruit le fichier original.

Interaction : **glissé-déposé** uniquement. Pas de formulaire, pas de login.

## LOT 1 (en cours)

| Axe     | Cible                                                                 |
|---------|-----------------------------------------------------------------------|
| DÉLAI   | **2026-05-05 fin de soirée** (mise en prod ce soir)                   |
| COÛT    | 0 € d'hébergement (GitHub Pages) · ~3 h de dev max                    |
| QUALITÉ | Min vendable : drag & drop fonctionnel sur **JSON uniquement**, Chrome desktop, 100 % client-side. UI minimaliste mais soignée (Tailwind CDN, animations CSS ciblées). Pas de tests auto. |

**Definition of Done LOT 1** (binaire, vérifiable) :

- [ ] L'app est accessible via une URL publique GitHub Pages (`https://<user>.github.io/parure` ou équivalent).
- [ ] Je dépose un fichier **JSON** → je récupère 2 fichiers téléchargeables (templaté + correspondance).
- [ ] Je dépose les 2 fichiers (templaté + correspondance) → je récupère le fichier d'origine, **byte-à-byte identique** sur un round-trip simple, y compris avec valeurs contenant guillemets, backslashes, caractères Unicode.
- [ ] Si l'utilisateur dépose un fichier non-JSON, message d'erreur clair (pas de plantage silencieux).
- [ ] Aucune dépendance serveur, aucun build step, vanilla JS + Tailwind CDN.
- [ ] Historique localStorage : chaque transformation (Original, Templaté, Correspondance, ou Restauré) est stockée avec timestamp, et 1 clic sur une entrée la recharge dans la zone résultat.
- [ ] Auto-scroll vers la zone résultat dès qu'une transformation est produite.

**Limite assumée** : le round-trip est byte-à-byte identique uniquement si le fichier d'entrée a un formatting uniforme (indent cohérent, pas de mix compact/multi-ligne). Sinon, la sortie est sémantiquement identique mais reformatée en pretty-print uniforme — dérivation de `JSON.stringify` natif, attendue.

## Stack & décisions arrêtées (LOT 1)

- **Stack** : HTML + CSS + Vanilla JS, Tailwind via CDN, animations CSS pures. Pas de build step. Pas de framework. Détails dans `CLAUDE.md`.
- **Format de config supporté** : **JSON uniquement**. Tout autre input → erreur explicite. Multi-format → LOT 2.
- **Convention de nommage** : `${VAR_1}`, `${VAR_2}`, … numérotation incrémentale dans l'ordre d'apparition.
- **Fichier de correspondance** : JSON `{ "VAR_1": "valeur_originale", … }`.
- **Échappement** : délégué à `JSON.parse` / `JSON.stringify` natifs (pas de regex maison).

## Backlog — NE PAS exécuter pendant LOT 1

- **LOT 2** : support YAML, .env, .properties, .toml.
- **LOT 3** : déduplication (deux occurrences de la même valeur → même variable).
- **LOT 4** : option "exclure certaines clés / valeurs" via une regex.
- **LOT 5** : polish UI (CSS soigné, mode sombre, animations drop zone).
- **LOT 6** : tests unitaires + CI GitHub Actions.
- **LOT 7** : i18n (FR/EN).
- **LOT 8** : compatibilité mobile / Safari / Firefox.
- **LOT 9** : nom de domaine custom.

## Journal des dérives évitées

<!-- Une ligne à chaque idée versée au LOT N+1 ou rejetée. Format : YYYY-MM-DD — verdict : <quoi> — raison : <pourquoi>. -->
- 2026-05-05 — LOT N+1 : tests unitaires, CI, multi-format, polish UI — raison : non requis pour la mise en prod ce soir, l'objectif est binaire (ça marche sur 1 format = livré).
- 2026-05-05 — LOT N+1 : détection automatique multi-format (YAML, .env, TOML, .properties, XML…) — raison : faisable techniquement mais explose le délai "ce soir". JSON-only en LOT 1, parser natif gère l'échappement.
- 2026-05-05 — GO LOT 1 (élargissement scope demandé par client) : historique localStorage + auto-scroll après transfo. Cadré en min vendable : 50 entrées max, drawer latéral, pas de recherche/édit/suppression unitaire.
