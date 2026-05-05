# LOT 2 — Support multi-format (YAML, TOML, .env, .properties)

**Date** : 2026-05-05
**Auteur** : Benoît Maréchal (avec Claude)
**Statut** : Spec validée, en attente de plan d'implémentation

## Contexte

LOT 1 livré : Parure anonymise/restaure des fichiers JSON, en client-side pur, sur https://benoit-marechal.github.io/parure/. Voir `QCD.md`.

Le LOT 2 étend la prise en charge à 4 formats supplémentaires : YAML, TOML, `.env`, `.properties`. La contrainte stack reste identique (vanilla JS, pas de build, Tailwind CDN).

## Objectif

Drop d'un fichier de config dans un des 5 formats supportés → templaté + mapping. Symétriquement, restauration par drop du templaté + mapping.

## Q / C / D

| Axe | Cible |
|-----|-------|
| DÉLAI | **2026-05-06 fin de journée** |
| COÛT | ~5 h de dev max, 0 € (tout CDN, pas de npm) |
| QUALITÉ | Hybride : **byte-à-byte** pour `.env` / `.properties` (formats plats), **sémantique** pour YAML / TOML (formats structurés). Pas de tests auto. |

## Definition of Done (binaire, vérifiable)

- [ ] Drop d'un `.yaml`, `.toml`, `.env`, `.properties` valide → 2 fichiers téléchargeables (templaté dans format d'origine + mapping JSON).
- [ ] Round-trip sémantique sur les 4 nouveaux formats (re-parse de l'original et du restauré → même structure JS).
- [ ] Round-trip **byte-à-byte** sur `.env` et `.properties` simples (commentaires, blank lines, ordre des clés préservés).
- [ ] Drop d'un fichier **sans extension ou avec extension non reconnue** → sniffing tenté ; succès affiche `"Format détecté : X"` ; échec affiche erreur claire.
- [ ] Drop d'une feature non supportée (YAML multi-doc, .env multilignes, .properties line continuation) → erreur explicite, pas de plantage silencieux.
- [ ] Aucun build step ajouté. Aucune dépendance npm. Tout charge depuis CDN ou implémenté maison.
- [ ] Tests manuels : 1 fichier représentatif par format dans `tests/originals/` + paires correspondantes dans `tests/restore-pairs/`.

## Architecture

### Structure de fichiers

```
/
├── index.html        ← un seul ajout : balises <script> CDN pour js-yaml + @iarna/toml
├── style.css         ← inchangé
├── app.js            ← refactor minimal : externalise parse/serialize via window.PARURE_ADAPTERS
├── adapters/         ← NOUVEAU
│   ├── index.js      ← detectAdapter(filename, text) + helpers
│   ├── json.js       ← {parse: JSON.parse, serialize: JSON.stringify}
│   ├── yaml.js       ← uses window.jsyaml
│   ├── toml.js       ← uses window.TOML (lib @iarna/toml UMD)
│   ├── env.js        ← parser maison (byte-à-byte via meta.lines)
│   ├── properties.js ← parser maison (byte-à-byte)
│   └── sniff.js      ← sniff(text) → ext | null
└── tests/
    ├── originals/         ← + 4 fichiers (.yaml, .toml, .env, .properties)
    └── restore-pairs/     ← + paires correspondantes
```

**Choix structurels** :

- Pas de bundler (contrainte projet) → fichiers `.js` chargés via `<script>` séquentiel dans `index.html`. Chaque adaptateur s'enregistre via `window.PARURE_ADAPTERS.push({...})`.
- Pas de modules ESM côté navigateur (cohérent avec l'IIFE actuel de `app.js`).
- Structure plate sous `adapters/`, pas de sous-dossier par adaptateur.

### Contrat adaptateur

Chaque adaptateur expose :

```js
window.PARURE_ADAPTERS.push({
  name: 'yaml',                   // identifiant unique
  extensions: ['.yaml', '.yml'],  // extensions matchées (lowercase)
  fidelity: 'semantic',           // 'semantic' | 'byte-exact'
  parse(text) {
    // → { tree, meta }
    // tree : valeur JS générique (objet/array/scalar) — ce que mange le walker existant
    // meta : opaque, propre à l'adaptateur (ex: env → { lines: [...] }; sinon {})
    return { tree: jsyaml.load(text), meta: {} };
  },
  serialize(tree, meta) {
    // → string dans le format de l'adaptateur
    return jsyaml.dump(tree, { lineWidth: -1, noRefs: true, quotingType: '"' });
  },
});
```

### `adapters/index.js` — détection

```js
function detectAdapter(filename, text) {
  // 1. Match par extension (case-insensitive)
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
  const byExt = window.PARURE_ADAPTERS.find(a => a.extensions.includes(ext));
  if (byExt) return { adapter: byExt, source: 'extension' };

  // 2. Fallback sniffing
  const guessed = sniff(text); // → 'json' | 'yaml' | 'toml' | 'env' | 'properties' | null
  if (guessed) {
    return {
      adapter: window.PARURE_ADAPTERS.find(a => a.name === guessed),
      source: 'sniff',
    };
  }

  // 3. Erreur explicite
  return {
    error: 'Format non détecté. Renomme le fichier avec une extension explicite (.json, .yaml, .toml, .env, .properties).',
  };
}
```

**Le mapping reste toujours en JSON** : la dropzone "mapping" en mode restore force l'adaptateur JSON, pas de détection.

**L'output templaté garde le format d'entrée** : `app.yaml` → `app.template.yaml`. Le mapping s'écrit `app.mapping.json` (toujours).

**Toast de transparence** : quand `source === 'sniff'`, afficher `"Format détecté : YAML"` (ou autre) pendant 2.5 s.

## Data flow

### Anonymize

```
file droppé
   ↓
detectAdapter(filename, text) → { adapter, source } | { error }
   ↓                                                       ↓
parse(text) → { tree, meta }                          showToast(error)
   ↓
walker existant : anonymize(tree, mapping, counter) → templatedTree
   ↓                                          ↘
serialize(templatedTree, meta) → templatedText  mapping {VAR_N: value}
   ↓                                                ↓
output: { template: { filename: `${base}.template.${ext}`, content: templatedText },
          mapping:  { filename: `${base}.mapping.json`,    content: JSON.stringify(mapping, null, 2) },
          source:   { filename, content: text } }
```

### Restore

```
fichier templaté + fichier mapping (toujours JSON) déposés
   ↓
detectAdapter(templateName, templateText) → adapter
JSON.parse(mappingText)                   → mappingObj
   ↓
adapter.parse(templateText) → { tree, meta }
   ↓
walker existant : restore(tree, mappingObj) → restoredTree
   ↓
adapter.serialize(restoredTree, meta) → restoredText
   ↓
output: { restored: { filename: `${base}.restored.${ext}`, content: restoredText }, ... }
```

**Le walker `anonymize/restore` actuel (`app.js` lignes 191-243) est inchangé** — c'est ce qui permet le refactor minimal. Il opère sur l'arbre JS générique, agnostique du format.

### Subtilité — formats `byte-exact` (.env, .properties)

- `parse(text)` retourne `{ tree, meta: { lines: [...] } }` où `lines` liste les lignes originales : `{ kind: 'kv'|'comment'|'blank', key?, valueRaw?, raw }`.
- Le walker remplace les valeurs dans `tree` (un plain object string→string).
- `serialize(tree, meta)` reconstruit le texte en remplaçant **uniquement la portion valeur** des lignes `kv` (en réutilisant le quoting/séparateur d'origine) ; commentaires, lignes vides, ordre préservés byte-à-byte.

## Adaptateurs — détails

### `json.js` (existant, juste sorti dans son fichier)

- `parse: JSON.parse`, `serialize: (t) => JSON.stringify(t, null, indent)` avec indent détecté (helper existant).
- Fidélité : sémantique (déjà le cas en LOT 1).

### `yaml.js`

- Lib : `js-yaml@4.1.0` via `https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js` (UMD, `window.jsyaml`).
- `parse: jsyaml.load(text)` — résout anchors/aliases en input.
- `serialize: jsyaml.dump(tree, { lineWidth: -1, noRefs: true, quotingType: '"' })`.
- Limitations connues, à documenter via toast/erreur :
  - Commentaires perdus (sémantique, choix assumé).
  - YAML multi-document (`---` répétés) : on prend le 1er, **erreur si plusieurs**.
  - Tags custom (`!!something`) : ignorés (deviennent string).

### `toml.js`

- Lib : `@iarna/toml@2.2.5` via `https://cdn.jsdelivr.net/npm/@iarna/toml@2.2.5/toml.js` (UMD, ~70 Ko, `window.TOML`).
- `parse: TOML.parse`, `serialize: TOML.stringify`.
- Choix UMD plutôt que `smol-toml` (ESM-only) pour éviter la friction `<script type="module">` et garder un chargement homogène.
- Fidélité : sémantique. Commentaires/ordre des sections perdus à la sérialisation.
- TOML datetime : conservé tel que rendu par la lib.

### `env.js` — parser maison

- Format : `KEY=value`, `KEY="value with spaces"`, `KEY='value'`, commentaires `#`, blank lines.
- Pas de support de l'expansion `${OTHER_VAR}` (laissé tel quel comme valeur littérale, sinon round-trip cassé).
- `parse` : split par `\n`, regex `/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/` ; extraction valeur (avec/sans quotes).
- `meta.lines` : `[{ kind, key?, valueRaw?, raw }, ...]` dans l'ordre du fichier.
- `serialize` : reconstruit ligne par ligne. Pour les `kv`, remplace seulement la portion valeur en réutilisant le quoting d'origine.
- **Multilignes (`KEY="line1\nline2"`)** : non supporté en LOT 2 → erreur explicite (`".env multilignes pas supporté"`). LOT 3.

### `properties.js` — parser maison ≈ env

- Format Java : `key=value` ou `key:value` ou `key value`, commentaires `#` ou `!`, line continuation avec `\` en fin de ligne, échappement Unicode `\uXXXX`.
- `meta.lines` similaire à env (kind, key, valueRaw, raw, separator).
- `serialize` : remplace uniquement la portion valeur, préserve séparateur (`=`, `:`, espace).
- **Line continuations** : non supportées en LOT 2 → erreur explicite. LOT 3.

### `sniff.js` — détection par contenu

Algorithme ordonné (premier match gagne) :

1. `text.trimStart()` commence par `{` ou `[` → tenter `JSON.parse` → si OK → **`json`**.
2. Première ligne non vide est `---` → **`yaml`**.
3. Présence d'une ligne matchant `^\[[\w.-]+\]\s*$` (header de section) ET pas de `:` en valeur → **`toml`**.
4. **≥ 70 %** des lignes non-vides matchent `^[A-Z_][A-Z0-9_]*\s*=` → **`env`**.
5. **≥ 70 %** des lignes non-vides matchent `^[a-zA-Z][\w.-]*\s*[:=]` (séparateur `:` ou `=`) → **`properties`**.
6. Sinon → `null` (erreur "format non détecté").

**Tradeoff signalé** : le sniffing peut se tromper sur des fichiers ambigus (.env minimal vs .properties). Le toast `"Format détecté : X"` permet à l'utilisateur de constater et renommer si besoin.

## Edge cases & error handling

| Cas | Comportement |
|-----|--------------|
| Extension inconnue + sniffing échoue | Toast erreur : *"Format non détecté. Renomme avec une extension explicite."* |
| Parse error (JSON/YAML/TOML invalide) | Toast erreur : *"Erreur YAML : <message lib>"* — pas de plantage |
| Mapping non-objet en mode restore | Toast (existant LOT 1) — pas de changement |
| YAML multi-doc, .env multiline, .properties continuation | Toast erreur explicite *"<feature> non supporté, voir LOT 3"* |
| Fichier > 5 Mo | Toast warning *"Fichier volumineux, traitement peut être lent"* — pas de hard limit |
| TOML lib pas chargée (CDN down) | Au démarrage, vérifier `window.TOML` ; si absent, désactiver l'adaptateur TOML et afficher dans la dropzone *"TOML indisponible"* |
| Tree YAML avec anchors → après serialize, perte des anchors | Accepté (sémantique). LOT 3 si l'utilisateur s'en plaint. |

## Changes UI

- Dropzone anonymize : label `"Glisse un .json ici"` → `"Glisse un fichier de config ici"` ; sous-titre : `"JSON · YAML · TOML · .env · .properties"`.
- Dropzone restore (template) : `accept` de l'input file passe à `.json,.yaml,.yml,.toml,.env,.properties,application/json,text/plain,text/yaml`.
- Dropzone restore (mapping) : reste `.json` only.
- Toast `"Format détecté : YAML"` (cas sniff uniquement).
- Pas de nouvelle UI de sélection de format. Pas de mode dark/light. Aucun nouveau bouton.

## Hors scope (LOT 3+)

Reportés explicitement :

- YAML multi-document (`---` répétés)
- `.env` valeurs multilignes
- `.properties` line continuations (`\` en fin de ligne)
- Préservation byte-à-byte des commentaires et formatting YAML/TOML
- Déduplication de valeurs identiques (déjà LOT 3 dans le QCD initial)
- Option "exclure certaines clés via regex" (déjà LOT 4 dans le QCD initial)

## Tests manuels (DoD)

1 fichier par format dans `tests/originals/` + paires correspondantes dans `tests/restore-pairs/`. Cas représentatifs :
- `06-config.yaml` — niveaux d'indentation, scalaires variés, listes.
- `07-config.toml` — sections, dotted keys, datetimes, types variés.
- `08-config.env` — clés simples, valeurs quotées, commentaires, blanks.
- `09-config.properties` — séparateurs mixtes (`=`, `:`, espace), commentaires `#` et `!`.

## Références

- LOT 1 : voir `QCD.md`, app en prod sur https://benoit-marechal.github.io/parure/
- Walker existant : `app.js` lignes 191-243 (anonymize/restore récursifs sur arbre JS).
- Convention de nommage des variables : inchangée (`${VAR_N}`, numérotation incrémentale dans l'ordre d'apparition).
