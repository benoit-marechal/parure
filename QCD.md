# QCD — Parure

## Objectif

Mettre en ligne **ce soir** une mini-SPA gratuite (GitHub Pages) qui :

1. **Anonymise** un fichier de configuration : remplace les *valeurs* par des noms de variables auto-générés (les *clés* restent intactes), et produit deux fichiers en sortie :
   - le fichier de config templaté
   - le fichier de correspondance `nom_de_variable → valeur_originale`
2. **Restaure** : à partir d'un fichier templaté + d'un fichier de correspondance, reconstruit le fichier original.

Interaction : **glissé-déposé** uniquement. Pas de formulaire, pas de login.

## LOT 1 — DONE (2026-05-05)

**Livré en prod** : https://benoit-marechal.github.io/parure/ · repo : https://github.com/benoit-marechal/parure

| Axe     | Cible                                                                 |
|---------|-----------------------------------------------------------------------|
| DÉLAI   | 2026-05-05 fin de soirée — **respecté**                               |
| COÛT    | 0 € d'hébergement (GitHub Pages) · ~3 h de dev — **respecté**         |
| QUALITÉ | Min vendable : drag & drop fonctionnel sur **JSON uniquement**, Chrome desktop, 100 % client-side. UI minimaliste mais soignée (Tailwind CDN, animations CSS ciblées). Pas de tests auto. |

**DoD LOT 1 (atteinte)** :

- [x] App accessible via URL publique GitHub Pages.
- [x] Drop JSON → 2 fichiers téléchargeables (templaté + correspondance).
- [x] Drop des 2 fichiers → fichier d'origine, byte-à-byte identique sur round-trip simple (guillemets, backslashes, Unicode).
- [x] Drop d'un non-JSON → message d'erreur clair, pas de plantage.
- [x] Aucune dépendance serveur, aucun build step, vanilla JS + Tailwind CDN.
- [x] Historique localStorage avec timestamp + reload sur clic.
- [x] Auto-scroll vers la zone résultat après transformation.

**Limite assumée** : round-trip byte-à-byte identique uniquement si le fichier d'entrée a un formatting uniforme (indent cohérent, pas de mix compact/multi-ligne). Sinon, sortie sémantiquement identique mais reformatée en pretty-print uniforme — dérivation de `JSON.stringify` natif, attendue.

## LOT 2 — SHIPPED (2026-05-05, 1 jour d'avance sur délai)

Support YAML, TOML, `.env`, `.properties` (en plus du JSON déjà géré). En prod sur https://benoit-marechal.github.io/parure/.

| Axe     | Cible                                                                 |
|---------|-----------------------------------------------------------------------|
| DÉLAI   | 2026-05-06 fin de journée — **respecté avec 1 jour d'avance**         |
| COÛT    | ~5 h dev — **respecté** (~3h effectif grâce parallélisation subagents)|
| QUALITÉ | Hybride : **byte-à-byte** pour `.env` / `.properties` (validé), **sémantique** pour YAML / TOML. Pas de tests auto. |

**DoD LOT 2** :

- [x] Drop d'un `.yaml`, `.toml`, `.env`, `.properties` valide → 2 fichiers téléchargeables (templaté + mapping JSON). *Code vérifié, à valider manuellement en prod par l'utilisateur.*
- [x] Round-trip byte-à-byte `.env` / `.properties` (testé via Node : 2/2 PASS sur fixtures avec commentaires + blanks + quoting préservés).
- [-] Round-trip sémantique YAML / TOML — implémentation OK, **vérification manuelle prod à faire** (drop `06-config.yaml` et `07-config.toml`).
- [x] Sniffing testé sur 7 cas représentatifs (json, yaml, toml, env, properties, ambigu, random) : 7/7 PASS.
- [x] Erreurs explicites pour features non supportées (YAML multi-doc, `.env` multiligne, `.properties` continuation) — `throw` codé dans les 3 adaptateurs.
- [x] Aucun build step ajouté. Aucune dépendance npm. Libs CDN : js-yaml@4.1.0 + @iarna/toml@2.2.5.
- [x] 4 paires de fichiers tests créées (`tests/originals/` + `tests/restore-pairs/`).

**Spec** : `docs/superpowers/specs/2026-05-05-lot2-multi-format-design.md`
**Plan** : `docs/superpowers/plans/2026-05-05-lot2-multi-format.md`

## Stack & décisions arrêtées (LOT 1)

- **Stack** : HTML + CSS + Vanilla JS, Tailwind via CDN, animations CSS pures. Pas de build step. Pas de framework. Détails dans `CLAUDE.md`.
- **Format de config supporté** : **JSON uniquement**. Tout autre input → erreur explicite. Multi-format → LOT 2.
- **Convention de nommage** : `${VAR_1}`, `${VAR_2}`, … numérotation incrémentale dans l'ordre d'apparition.
- **Fichier de correspondance** : JSON `{ "VAR_1": "valeur_originale", … }`.
- **Échappement** : délégué à `JSON.parse` / `JSON.stringify` natifs (pas de regex maison).

## Backlog

- **LOT 3** : features non supportées en LOT 2 (YAML multi-doc, `.env` multilignes, `.properties` line continuation), préservation byte-à-byte des commentaires YAML/TOML, déduplication (deux occurrences même valeur → même variable).
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
