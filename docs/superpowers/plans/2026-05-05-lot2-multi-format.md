# LOT 2 Multi-Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Étendre Parure pour anonymiser/restaurer des fichiers YAML, TOML, .env, .properties (en plus du JSON existant), avec détection auto par extension et fallback sniffing.

**Architecture:** Adaptateurs uniformes enregistrés dans `window.PARURE_ADAPTERS` ; `app.js` reste agnostique du format et délègue parse/serialize à l'adaptateur sélectionné par `detectAdapter(filename, text)`. Le walker `anonymize/restore` (lignes 191-243 actuelles) reste **inchangé**.

**Tech Stack:** Vanilla JS, pas de build step, Tailwind CDN. Libs ajoutées via CDN UMD : `js-yaml@4.1.0` (`window.jsyaml`) et `@iarna/toml@2.2.5` (`window.TOML`). Parsers `.env` / `.properties` implémentés maison (~80 lignes chacun).

**Spec source :** `docs/superpowers/specs/2026-05-05-lot2-multi-format-design.md`

---

## File Structure

**Créés :**
- `adapters/index.js` — `detectAdapter(filename, text)`, registre lookup
- `adapters/json.js` — extraction du parse/serialize JSON existant
- `adapters/yaml.js` — wrapper sur `window.jsyaml`
- `adapters/toml.js` — wrapper sur `window.TOML`
- `adapters/env.js` — parser maison + serializer byte-à-byte
- `adapters/properties.js` — parser maison ≈ env
- `adapters/sniff.js` — détection par contenu, expose `window.PARURE_SNIFF`
- `tests/originals/06-config.yaml`
- `tests/originals/07-config.toml`
- `tests/originals/08-config.env`
- `tests/originals/09-config.properties`
- `tests/restore-pairs/06-config.template.yaml`
- `tests/restore-pairs/06-config.mapping.json`
- `tests/restore-pairs/07-config.template.toml`
- `tests/restore-pairs/07-config.mapping.json`
- `tests/restore-pairs/08-config.template.env`
- `tests/restore-pairs/08-config.mapping.json`
- `tests/restore-pairs/09-config.template.properties`
- `tests/restore-pairs/09-config.mapping.json`

**Modifiés :**
- `app.js` — refactor handleFile / runAnonymize / tryRestore pour utiliser detectAdapter (pas de changement du walker)
- `index.html` — ajout des `<script>` CDN + adapters, label dropzone, accept attribute

---

## Convention "tests"

Le QCD interdit les **tests automatisés**. Les "tests" de ce plan sont :
1. **Fichiers de référence** dans `tests/originals/` et `tests/restore-pairs/` (créés par chaque tâche).
2. **Vérification manuelle** : drop dans l'app, observer le résultat. Cas-test décrits dans chaque tâche.

Pas de framework de test, pas d'asserts auto. La vérification est humaine.

---

## Task 1 — Refactor app.js : externaliser le contrat adaptateur

**Files:**
- Modify: `app.js:134-243` (handleFile, runAnonymize, tryRestore)
- Modify: `app.js:1` (ajout `window.PARURE_ADAPTERS`)

- [ ] **Step 1.1: Ouvrir un fichier de référence pour drop manuel**

Vérifier que le test JSON existant marche encore après le refactor : `tests/originals/05-insane.json` (le plus complet).

- [ ] **Step 1.2: Ajouter le registre global au début de app.js**

Modifier la ligne 1 de `app.js` :

```js
// Avant :
(() => {
  const HISTORY_KEY = 'parure.history.v1';

// Après :
window.PARURE_ADAPTERS = window.PARURE_ADAPTERS || [];
(() => {
  const HISTORY_KEY = 'parure.history.v1';
```

- [ ] **Step 1.3: Remplacer handleFile (lignes 134-149)**

Remplacer entièrement la fonction `handleFile` :

```js
async function handleFile(dz, file) {
  const text = await file.text();
  const target = dz.dataset.target;

  // Mode mapping en restore : toujours JSON, pas de détection
  if (target === 'mapping') {
    const parsed = tryParseJSON(text);
    if (!parsed.ok) {
      showToast(`Mapping non-JSON : ${parsed.error}`, 'error');
      return;
    }
    state.files.mapping = { tree: parsed.value, text, name: file.name, adapter: null };
    markDropzoneFile(dz, file.name);
    tryRestore();
    return;
  }

  // Détection adaptateur (anonymize ou template)
  const detection = window.detectAdapter(file.name, text);
  if (detection.error) {
    showToast(detection.error, 'error');
    return;
  }
  let parsed;
  try {
    parsed = detection.adapter.parse(text);
  } catch (err) {
    showToast(`Erreur ${detection.adapter.name.toUpperCase()} : ${err.message}`, 'error');
    return;
  }
  if (detection.source === 'sniff') {
    showToast(`Format détecté : ${detection.adapter.name.toUpperCase()}`, 'success');
  }
  if (target === 'anonymize') {
    runAnonymize(parsed.tree, parsed.meta, text, file.name, detection.adapter);
  } else if (target === 'template') {
    state.files.template = { tree: parsed.tree, meta: parsed.meta, text, name: file.name, adapter: detection.adapter };
    markDropzoneFile(dz, file.name);
    tryRestore();
  }
}
```

- [ ] **Step 1.4: Remplacer runAnonymize (lignes 173-189)**

```js
function runAnonymize(tree, meta, originalText, filename, adapter) {
  const mapping = {};
  const counter = { n: 1 };
  const templated = anonymize(tree, mapping, counter);
  const baseName = stripExt(filename) || 'config';
  const ext = adapter.extensions[0]; // .json, .yaml, .toml, .env, .properties

  let templatedText;
  try {
    templatedText = adapter.serialize(templated, meta);
  } catch (err) {
    showToast(`Erreur sérialisation ${adapter.name.toUpperCase()} : ${err.message}`, 'error');
    return;
  }

  const result = {
    mode: 'anonymize',
    source: { filename: filename || `config${ext}`, content: originalText },
    template: { filename: `${baseName}.template${ext}`, content: templatedText },
    mapping: { filename: `${baseName}.mapping.json`, content: JSON.stringify(mapping, null, 2) },
  };
  showResult(result);
  pushHistory(result);
  showToast(`${counter.n - 1} valeur(s) anonymisée(s)`, 'success');
}
```

- [ ] **Step 1.5: Remplacer tryRestore (lignes 203-227)**

```js
function tryRestore() {
  if (!state.files.template || !state.files.mapping) return;

  const tplFile = state.files.template;
  const mapFile = state.files.mapping;

  if (!isPlainObject(mapFile.tree)) {
    showToast('La correspondance doit être un objet JSON { "VAR_1": ... }', 'error');
    return;
  }

  const restored = restore(tplFile.tree, mapFile.tree);
  const ext = tplFile.adapter.extensions[0];
  const baseName = stripExt(tplFile.name).replace(/\.template$/i, '') || 'config';

  let restoredText;
  try {
    restoredText = tplFile.adapter.serialize(restored, tplFile.meta);
  } catch (err) {
    showToast(`Erreur sérialisation : ${err.message}`, 'error');
    return;
  }

  const result = {
    mode: 'restore',
    restored: { filename: `${baseName}.restored${ext}`, content: restoredText },
    template: { filename: tplFile.name, content: tplFile.text },
    mapping: { filename: mapFile.name, content: mapFile.text },
  };
  showResult(result);
  pushHistory(result);
  showToast('Fichier restauré', 'success');
}
```

- [ ] **Step 1.6: Modifier stripExt pour gérer toutes les extensions**

Remplacer la fonction (ligne 496) :

```js
function stripExt(name) {
  return name.replace(/\.(json|ya?ml|toml|env|properties)$/i, '');
}
```

- [ ] **Step 1.7: Modifier openFilePicker pour accepter les nouveaux formats**

Remplacer (ligne 123-132) la ligne `input.accept = '.json,application/json,text/plain';` par :

```js
const target = dz.dataset.target;
if (target === 'mapping') {
  input.accept = '.json,application/json';
} else {
  input.accept = '.json,.yaml,.yml,.toml,.env,.properties,application/json,text/plain,text/yaml';
}
```

- [ ] **Step 1.8: Vérification manuelle JSON régression**

⚠️ **À ce stade, l'app est cassée car aucun adaptateur n'est encore enregistré.** Cette tâche se valide après Task 3 (json.js créé). Passer directement à Task 2.

---

## Task 2 — adapters/index.js : detectAdapter

**Files:**
- Create: `adapters/index.js`

- [ ] **Step 2.1: Créer le fichier**

```js
window.detectAdapter = function detectAdapter(filename, text) {
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
  const byExt = window.PARURE_ADAPTERS.find((a) => a.extensions.includes(ext));
  if (byExt) return { adapter: byExt, source: 'extension' };

  if (typeof window.PARURE_SNIFF === 'function') {
    const guessed = window.PARURE_SNIFF(text);
    if (guessed) {
      const adapter = window.PARURE_ADAPTERS.find((a) => a.name === guessed);
      if (adapter) return { adapter, source: 'sniff' };
    }
  }

  return {
    error: 'Format non détecté. Renomme le fichier avec une extension explicite (.json, .yaml, .toml, .env, .properties).',
  };
};
```

- [ ] **Step 2.2: Pas de commit isolé** — sera commit en bloc avec les autres adaptateurs (Task 9).

---

## Task 3 — adapters/json.js : extraction du JSON

**Files:**
- Create: `adapters/json.js`

- [ ] **Step 3.1: Créer le fichier**

```js
(function () {
  function detectIndent(text) {
    const lines = text.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const m = lines[i].match(/^([ \t]+)\S/);
      if (m) return m[1];
    }
    return 2;
  }

  window.PARURE_ADAPTERS.push({
    name: 'json',
    extensions: ['.json'],
    fidelity: 'semantic',
    parse(text) {
      return { tree: JSON.parse(text), meta: { indent: detectIndent(text) } };
    },
    serialize(tree, meta) {
      return JSON.stringify(tree, null, meta.indent);
    },
  });
})();
```

- [ ] **Step 3.2: Vérifier la régression JSON**

Une fois Task 9 (index.html mis à jour) faite, drop `tests/originals/05-insane.json` :
- ✅ 2 fichiers téléchargeables produits.
- ✅ Round-trip byte-à-byte intact (drop des 2 fichiers en mode restore → texte identique).

Pour cette tâche, juste créer le fichier. La vérification se fait en Task 11.

---

## Task 4 — adapters/yaml.js + tests YAML  *[PARALLÉLISABLE]*

**Files:**
- Create: `adapters/yaml.js`
- Create: `tests/originals/06-config.yaml`
- Create: `tests/restore-pairs/06-config.template.yaml`
- Create: `tests/restore-pairs/06-config.mapping.json`

- [ ] **Step 4.1: Créer adapters/yaml.js**

```js
(function () {
  window.PARURE_ADAPTERS.push({
    name: 'yaml',
    extensions: ['.yaml', '.yml'],
    fidelity: 'semantic',
    parse(text) {
      if (typeof window.jsyaml === 'undefined') {
        throw new Error('Lib js-yaml non chargée (CDN injoignable ?)');
      }
      const docs = jsyaml.loadAll(text);
      if (docs.length === 0) return { tree: null, meta: {} };
      if (docs.length > 1) {
        throw new Error('YAML multi-document non supporté (LOT 3)');
      }
      return { tree: docs[0], meta: {} };
    },
    serialize(tree, meta) {
      return jsyaml.dump(tree, { lineWidth: -1, noRefs: true, quotingType: '"' });
    },
  });
})();
```

- [ ] **Step 4.2: Créer tests/originals/06-config.yaml**

```yaml
api:
  url: "https://api.example.com"
  key: "sk_live_abc123"
  timeout: 30
db:
  host: localhost
  port: 5432
  credentials:
    user: admin
    password: "p@ssw0rd!"
features:
  - feature_a
  - feature_b
  - feature_c
debug: true
```

- [ ] **Step 4.3: Créer la paire restore-pair attendue**

`tests/restore-pairs/06-config.template.yaml` :

```yaml
api:
  url: "${VAR_1}"
  key: "${VAR_2}"
  timeout: "${VAR_3}"
db:
  host: "${VAR_4}"
  port: "${VAR_5}"
  credentials:
    user: "${VAR_6}"
    password: "${VAR_7}"
features:
  - "${VAR_8}"
  - "${VAR_9}"
  - "${VAR_10}"
debug: "${VAR_11}"
```

`tests/restore-pairs/06-config.mapping.json` :

```json
{
  "VAR_1": "https://api.example.com",
  "VAR_2": "sk_live_abc123",
  "VAR_3": 30,
  "VAR_4": "localhost",
  "VAR_5": 5432,
  "VAR_6": "admin",
  "VAR_7": "p@ssw0rd!",
  "VAR_8": "feature_a",
  "VAR_9": "feature_b",
  "VAR_10": "feature_c",
  "VAR_11": true
}
```

- [ ] **Step 4.4: Vérification manuelle (à faire en Task 11)**

Drop `06-config.yaml` en anonymize → comparer avec `06-config.template.yaml` (sémantique = re-parse identique, formatage peut différer).

---

## Task 5 — adapters/toml.js + tests TOML  *[PARALLÉLISABLE]*

**Files:**
- Create: `adapters/toml.js`
- Create: `tests/originals/07-config.toml`
- Create: `tests/restore-pairs/07-config.template.toml`
- Create: `tests/restore-pairs/07-config.mapping.json`

- [ ] **Step 5.1: Créer adapters/toml.js**

```js
(function () {
  window.PARURE_ADAPTERS.push({
    name: 'toml',
    extensions: ['.toml'],
    fidelity: 'semantic',
    parse(text) {
      if (typeof window.TOML === 'undefined') {
        throw new Error('Lib @iarna/toml non chargée (CDN injoignable ?)');
      }
      return { tree: window.TOML.parse(text), meta: {} };
    },
    serialize(tree, meta) {
      return window.TOML.stringify(tree);
    },
  });
})();
```

- [ ] **Step 5.2: Créer tests/originals/07-config.toml**

```toml
title = "Mon application"
version = "1.0.0"

[api]
url = "https://api.example.com"
key = "sk_live_abc123"
timeout = 30

[db]
host = "localhost"
port = 5432

[db.credentials]
user = "admin"
password = "p@ssw0rd!"

[[servers]]
name = "alpha"
ip = "10.0.0.1"

[[servers]]
name = "beta"
ip = "10.0.0.2"
```

- [ ] **Step 5.3: Créer la paire restore-pair attendue**

`tests/restore-pairs/07-config.template.toml` (généré par anonymize, structure attendue) :

```toml
title = "${VAR_1}"
version = "${VAR_2}"

[api]
url = "${VAR_3}"
key = "${VAR_4}"
timeout = "${VAR_5}"

[db]
host = "${VAR_6}"
port = "${VAR_7}"

[db.credentials]
user = "${VAR_8}"
password = "${VAR_9}"

[[servers]]
name = "${VAR_10}"
ip = "${VAR_11}"

[[servers]]
name = "${VAR_12}"
ip = "${VAR_13}"
```

⚠️ **Note** : Le format exact de `TOML.stringify` peut différer (ordre des sections, espacement). La paire est une référence sémantique, pas byte-à-byte. La vérification finale est : `TOML.parse(template) === <structure attendue>`.

`tests/restore-pairs/07-config.mapping.json` :

```json
{
  "VAR_1": "Mon application",
  "VAR_2": "1.0.0",
  "VAR_3": "https://api.example.com",
  "VAR_4": "sk_live_abc123",
  "VAR_5": 30,
  "VAR_6": "localhost",
  "VAR_7": 5432,
  "VAR_8": "admin",
  "VAR_9": "p@ssw0rd!",
  "VAR_10": "alpha",
  "VAR_11": "10.0.0.1",
  "VAR_12": "beta",
  "VAR_13": "10.0.0.2"
}
```

- [ ] **Step 5.4: Vérification manuelle (Task 11)**

---

## Task 6 — adapters/env.js + tests .env  *[PARALLÉLISABLE]*

**Files:**
- Create: `adapters/env.js`
- Create: `tests/originals/08-config.env`
- Create: `tests/restore-pairs/08-config.template.env`
- Create: `tests/restore-pairs/08-config.mapping.json`

- [ ] **Step 6.1: Créer adapters/env.js**

```js
(function () {
  function parse(text) {
    const useCRLF = text.includes('\r\n');
    const lines = text.split(/\r?\n/);
    const tree = {};
    const metaLines = [];

    for (const raw of lines) {
      const trimmed = raw.trim();

      if (trimmed === '') {
        metaLines.push({ kind: 'blank', raw });
        continue;
      }
      if (trimmed.startsWith('#')) {
        metaLines.push({ kind: 'comment', raw });
        continue;
      }

      const m = raw.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*?)(\s*)$/);
      if (m) {
        const [, leadSpace, key, sep, valuePart, trailSpace] = m;

        if (valuePart.startsWith('"') && (valuePart.length === 1 || !valuePart.endsWith('"'))) {
          throw new Error('.env multilignes pas supporté (LOT 3)');
        }
        if (valuePart.startsWith("'") && (valuePart.length === 1 || !valuePart.endsWith("'"))) {
          throw new Error('.env multilignes pas supporté (LOT 3)');
        }

        let value = valuePart;
        let quote = null;
        if (
          (valuePart.startsWith('"') && valuePart.endsWith('"') && valuePart.length >= 2) ||
          (valuePart.startsWith("'") && valuePart.endsWith("'") && valuePart.length >= 2)
        ) {
          quote = valuePart[0];
          value = valuePart.slice(1, -1);
        }
        tree[key] = value;
        metaLines.push({ kind: 'kv', key, leadSpace, sep, quote, trailSpace, raw });
      } else {
        metaLines.push({ kind: 'unknown', raw });
      }
    }

    return { tree, meta: { lines: metaLines, useCRLF } };
  }

  function serialize(tree, meta) {
    const sep = meta.useCRLF ? '\r\n' : '\n';
    const out = meta.lines.map((line) => {
      if (line.kind === 'kv') {
        const value = tree[line.key];
        const valStr = value === null || value === undefined ? '' : String(value);
        const quoted = line.quote ? `${line.quote}${valStr}${line.quote}` : valStr;
        return `${line.leadSpace}${line.key}${line.sep}${quoted}${line.trailSpace}`;
      }
      return line.raw;
    });
    return out.join(sep);
  }

  window.PARURE_ADAPTERS.push({
    name: 'env',
    extensions: ['.env'],
    fidelity: 'byte-exact',
    parse,
    serialize,
  });
})();
```

- [ ] **Step 6.2: Créer tests/originals/08-config.env**

```env
# Configuration API
API_URL=https://api.example.com
API_KEY="sk_live_abc123"
API_TIMEOUT=30

# Base de données
DB_HOST=localhost
DB_PORT=5432
DB_USER=admin
DB_PASSWORD='p@ssw0rd!'

DEBUG=true
```

- [ ] **Step 6.3: Créer la paire restore-pair**

`tests/restore-pairs/08-config.template.env` :

```env
# Configuration API
API_URL=${VAR_1}
API_KEY="${VAR_2}"
API_TIMEOUT=${VAR_3}

# Base de données
DB_HOST=${VAR_4}
DB_PORT=${VAR_5}
DB_USER=${VAR_6}
DB_PASSWORD='${VAR_7}'

DEBUG=${VAR_8}
```

`tests/restore-pairs/08-config.mapping.json` :

```json
{
  "VAR_1": "https://api.example.com",
  "VAR_2": "sk_live_abc123",
  "VAR_3": "30",
  "VAR_4": "localhost",
  "VAR_5": "5432",
  "VAR_6": "admin",
  "VAR_7": "p@ssw0rd!",
  "VAR_8": "true"
}
```

⚠️ **Note** : Pour .env, toutes les valeurs sont des strings (le format n'a pas de typage natif). Donc 30 → "30" dans le mapping.

- [ ] **Step 6.4: Vérification manuelle (Task 11)**

Critères :
- Round-trip byte-à-byte : `08-config.env` → anonymize → restore → fichier IDENTIQUE byte-à-byte.
- Commentaires `# Configuration API` et `# Base de données` préservés.
- Lignes vides préservées.
- Quoting d'origine préservé (`API_KEY` avec `"`, `DB_PASSWORD` avec `'`).

---

## Task 7 — adapters/properties.js + tests .properties  *[PARALLÉLISABLE]*

**Files:**
- Create: `adapters/properties.js`
- Create: `tests/originals/09-config.properties`
- Create: `tests/restore-pairs/09-config.template.properties`
- Create: `tests/restore-pairs/09-config.mapping.json`

- [ ] **Step 7.1: Créer adapters/properties.js**

```js
(function () {
  function parse(text) {
    const useCRLF = text.includes('\r\n');
    const lines = text.split(/\r?\n/);
    const tree = {};
    const metaLines = [];

    for (const raw of lines) {
      const trimmed = raw.trimStart();

      if (trimmed === '') {
        metaLines.push({ kind: 'blank', raw });
        continue;
      }
      if (trimmed.startsWith('#') || trimmed.startsWith('!')) {
        metaLines.push({ kind: 'comment', raw });
        continue;
      }
      if (raw.endsWith('\\')) {
        throw new Error('.properties line continuation pas supporté (LOT 3)');
      }

      const m = raw.match(/^(\s*)([^\s:=]+)(\s*[:=]\s*|\s+)(.*?)(\s*)$/);
      if (m) {
        const [, leadSpace, key, sep, value, trailSpace] = m;
        tree[key] = value;
        metaLines.push({ kind: 'kv', key, leadSpace, sep, trailSpace, raw });
      } else {
        metaLines.push({ kind: 'unknown', raw });
      }
    }

    return { tree, meta: { lines: metaLines, useCRLF } };
  }

  function serialize(tree, meta) {
    const sep = meta.useCRLF ? '\r\n' : '\n';
    const out = meta.lines.map((line) => {
      if (line.kind === 'kv') {
        const value = tree[line.key];
        const valStr = value === null || value === undefined ? '' : String(value);
        return `${line.leadSpace}${line.key}${line.sep}${valStr}${line.trailSpace}`;
      }
      return line.raw;
    });
    return out.join(sep);
  }

  window.PARURE_ADAPTERS.push({
    name: 'properties',
    extensions: ['.properties'],
    fidelity: 'byte-exact',
    parse,
    serialize,
  });
})();
```

- [ ] **Step 7.2: Créer tests/originals/09-config.properties**

```properties
# Configuration API
api.url=https://api.example.com
api.key=sk_live_abc123
api.timeout=30

! Base de données
db.host=localhost
db.port=5432
db.user : admin
db.password = p@ssw0rd!

debug=true
```

- [ ] **Step 7.3: Créer la paire restore-pair**

`tests/restore-pairs/09-config.template.properties` :

```properties
# Configuration API
api.url=${VAR_1}
api.key=${VAR_2}
api.timeout=${VAR_3}

! Base de données
db.host=${VAR_4}
db.port=${VAR_5}
db.user : ${VAR_6}
db.password = ${VAR_7}

debug=${VAR_8}
```

`tests/restore-pairs/09-config.mapping.json` :

```json
{
  "VAR_1": "https://api.example.com",
  "VAR_2": "sk_live_abc123",
  "VAR_3": "30",
  "VAR_4": "localhost",
  "VAR_5": "5432",
  "VAR_6": "admin",
  "VAR_7": "p@ssw0rd!",
  "VAR_8": "true"
}
```

- [ ] **Step 7.4: Vérification manuelle (Task 11)**

Critères :
- Round-trip byte-à-byte : commentaires `#` ET `!` préservés.
- Séparateurs mixtes préservés (`=`, ` : `, ` = ` avec espaces).
- Ordre des clés préservé.

---

## Task 8 — adapters/sniff.js : détection par contenu  *[PARALLÉLISABLE]*

**Files:**
- Create: `adapters/sniff.js`

- [ ] **Step 8.1: Créer le fichier**

```js
window.PARURE_SNIFF = function sniff(text) {
  const trimmed = text.trimStart();

  // 1. JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(text);
      return 'json';
    } catch {
      // fall through
    }
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return null;

  // 2. YAML : première ligne non vide est "---"
  if (lines[0].trim() === '---') return 'yaml';

  // 3. TOML : présence de [section] header
  const tomlSectionRe = /^\[[\w.-]+\]\s*$/;
  if (lines.some((l) => tomlSectionRe.test(l.trim()))) {
    return 'toml';
  }

  // 4. .env : ≥ 70% des lignes matchent KEY=value (KEY tout en majuscules)
  const envRe = /^[A-Z_][A-Z0-9_]*\s*=/;
  const envCount = lines.filter((l) => envRe.test(l.trim())).length;
  if (envCount / lines.length >= 0.7) return 'env';

  // 5. .properties : ≥ 70% des lignes matchent key:value ou key=value
  const propRe = /^[a-zA-Z][\w.-]*\s*[:=]/;
  const propCount = lines.filter((l) => propRe.test(l.trim())).length;
  if (propCount / lines.length >= 0.7) return 'properties';

  return null;
};
```

- [ ] **Step 8.2: Test mental rapide**

Vérifier que les exemples typiques sont bien détectés :
- `{"a":1}` → 'json' (début par `{`, parse OK).
- `---\nfoo: bar` → 'yaml' (1ère ligne `---`).
- `[section]\nfoo = "bar"` → 'toml' ([section] présent).
- `API_URL=...\nAPI_KEY=...` → 'env' (toutes lignes match `^[A-Z_]+=`).
- `api.url=...\napi.key=...` → 'properties' (lignes match `^[a-zA-Z][\w.-]*[:=]`).

---

## Task 9 — Intégration dans index.html

**Files:**
- Modify: `index.html` (ajout balises `<script>`, label dropzone)

- [ ] **Step 9.1: Ajouter les CDN libs avant la balise `<script src="app.js">`**

Trouver dans `index.html` la ligne `<script src="app.js"></script>` (vers la fin du body). **Avant** elle, insérer :

```html
  <!-- LOT 2 : libs CDN multi-format -->
  <script src="https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@iarna/toml@2.2.5/toml.js"></script>
  <!-- LOT 2 : adaptateurs Parure (sniff d'abord car referencé par index) -->
  <script src="adapters/sniff.js"></script>
  <script src="adapters/json.js"></script>
  <script src="adapters/yaml.js"></script>
  <script src="adapters/toml.js"></script>
  <script src="adapters/env.js"></script>
  <script src="adapters/properties.js"></script>
  <script src="adapters/index.js"></script>
```

- [ ] **Step 9.2: Modifier le label dropzone anonymize**

Trouver dans `index.html` (ligne ~62) :

```html
<p class="dropzone-title">Glisse un <span class="text-indigo-400 font-semibold">.json</span> ici</p>
<p class="dropzone-hint">ou clique pour choisir un fichier</p>
```

Remplacer par :

```html
<p class="dropzone-title">Glisse un <span class="text-indigo-400 font-semibold">fichier de config</span> ici</p>
<p class="dropzone-hint">JSON · YAML · TOML · .env · .properties</p>
```

- [ ] **Step 9.3: Vérifier l'ordre de chargement**

Ouvrir `index.html` dans un navigateur, ouvrir la console DevTools, taper `window.PARURE_ADAPTERS.map(a => a.name)`. Attendu : `['json', 'yaml', 'toml', 'env', 'properties']`.

---

## Task 10 — Test : régression JSON (DoD LOT 1 préservée)

**Files:** aucun

- [ ] **Step 10.1: Démarrer un serveur local**

```bash
cd /Users/fildz/Projets/Parure
python3 -m http.server 8765
```

- [ ] **Step 10.2: Drop tests/originals/05-insane.json**

Ouvrir `http://localhost:8765` dans Chrome. Drop le fichier dans la dropzone "Anonymiser".

Attendu :
- ✅ 2 fichiers téléchargeables (`.template.json` + `.mapping.json`).
- ✅ Toast "X valeur(s) anonymisée(s)".
- ✅ Aucun toast "Format détecté" (extension reconnue).

- [ ] **Step 10.3: Round-trip JSON**

Switch vers "Restaurer", drop le templaté + le mapping. Télécharger le restauré.

```bash
diff tests/originals/05-insane.json ~/Downloads/05-insane.restored.json
```

Attendu : aucune différence.

---

## Task 11 — Tests round-trip manuels sur les 4 nouveaux formats

**Files:** aucun

Pour chaque format, même procédure :

- [ ] **Step 11.1: YAML round-trip**

1. Drop `tests/originals/06-config.yaml` en anonymize → 2 fichiers téléchargés.
2. Vérifier que le templaté contient bien `${VAR_1}`, `${VAR_2}`, … aux emplacements des valeurs.
3. Switch en restore, drop les 2 fichiers téléchargés.
4. Vérifier que le restauré, **re-parsé en YAML**, donne la même structure JS que l'original re-parsé.

```bash
# Comparaison sémantique YAML (utilise python pour parser)
python3 -c "import yaml; print(yaml.safe_load(open('tests/originals/06-config.yaml')))" > /tmp/yaml-orig.txt
python3 -c "import yaml; print(yaml.safe_load(open(input())))" <<< "$HOME/Downloads/06-config.restored.yaml" > /tmp/yaml-restored.txt
diff /tmp/yaml-orig.txt /tmp/yaml-restored.txt
```

Attendu : aucune différence.

- [ ] **Step 11.2: TOML round-trip**

Idem avec `tests/originals/07-config.toml`.

```bash
python3 -c "import tomllib; print(tomllib.load(open('tests/originals/07-config.toml','rb')))" > /tmp/toml-orig.txt
python3 -c "import tomllib; print(tomllib.load(open('$HOME/Downloads/07-config.restored.toml','rb')))" > /tmp/toml-restored.txt
diff /tmp/toml-orig.txt /tmp/toml-restored.txt
```

Attendu : aucune différence.

- [ ] **Step 11.3: .env round-trip BYTE-À-BYTE**

```bash
diff tests/originals/08-config.env ~/Downloads/08-config.restored.env
```

Attendu : **aucune différence** (byte-à-byte, commentaires + blanks préservés).

- [ ] **Step 11.4: .properties round-trip BYTE-À-BYTE**

```bash
diff tests/originals/09-config.properties ~/Downloads/09-config.restored.properties
```

Attendu : **aucune différence**.

- [ ] **Step 11.5: Sniffing — fichier sans extension**

Copier `tests/originals/08-config.env` en `/tmp/anon-noext` (sans extension). Drop dans l'app.

Attendu :
- ✅ Toast "Format détecté : ENV".
- ✅ 2 fichiers téléchargeables.

- [ ] **Step 11.6: Erreurs explicites**

Créer un fichier `/tmp/multi.yaml` :
```yaml
---
foo: bar
---
baz: qux
```
Drop. Attendu : toast "Erreur YAML : YAML multi-document non supporté (LOT 3)".

Créer un fichier `/tmp/multiline.env` :
```env
KEY="line1
line2"
```
Drop. Attendu : toast "Erreur ENV : .env multilignes pas supporté (LOT 3)".

---

## Task 12 — Commit + push + déploiement

**Files:** aucun

- [ ] **Step 12.1: Vérifier l'état**

```bash
git status --short
```

Attendu : 14 nouveaux fichiers (7 adapters + 4 originals + 4 restore-pairs - 1 déjà existant) + 2 modifiés (app.js, index.html).

- [ ] **Step 12.2: Commit**

```bash
cd /Users/fildz/Projets/Parure
git add adapters/ tests/originals/ tests/restore-pairs/ app.js index.html
git commit -m "$(cat <<'EOF'
feat(LOT 2): support multi-format YAML/TOML/.env/.properties

- archi : adaptateurs uniformes via window.PARURE_ADAPTERS
- libs CDN : js-yaml@4.1.0 + @iarna/toml@2.2.5
- parsers maison : .env / .properties (byte-à-byte via meta.lines)
- détection auto par extension + fallback sniffing par contenu
- toast "Format détecté : X" en cas de sniff
- erreurs explicites pour features non supportées (multi-doc, multilignes, continuation)
- 4 jeux de test originals/ + restore-pairs/

DoD LOT 2 atteinte. Spec : docs/superpowers/specs/2026-05-05-lot2-multi-format-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 12.3: Push**

```bash
git push origin main
```

- [ ] **Step 12.4: Vérifier le déploiement Pages**

Attendre ~1 min, puis ouvrir https://benoit-marechal.github.io/parure/. Refaire le test 11.1 en production.

- [ ] **Step 12.5: Mettre à jour QCD.md**

Marquer LOT 2 DONE avec date dans QCD.md, commit puis push.

---

## Self-Review (à faire avant exécution)

**Spec coverage** :
- ✅ 4 nouveaux formats (Tasks 4-7) — couvert.
- ✅ Sniffing fallback (Task 8) — couvert.
- ✅ Toast transparence (Step 1.3 dans handleFile) — couvert.
- ✅ Erreurs explicites (Tasks 4, 6, 7 throw + Step 11.6 vérif) — couvert.
- ✅ Mapping toujours JSON (Step 1.3) — couvert.
- ✅ UI label + accept (Steps 1.7, 9.2) — couvert.
- ✅ Round-trip byte-à-byte env/properties (Tasks 6, 7, Steps 11.3-4) — couvert.
- ✅ Round-trip sémantique yaml/toml (Tasks 4, 5, Steps 11.1-2) — couvert.
- ✅ Tests dans `tests/originals/` + `tests/restore-pairs/` — couvert.

**Placeholder scan** : aucun TBD/TODO. Tout le code est explicite.

**Type consistency** :
- `parse(text)` retourne toujours `{ tree, meta }` ✅.
- `serialize(tree, meta)` retourne toujours `string` ✅.
- `detectAdapter(filename, text)` retourne `{ adapter, source } | { error }` ✅.
- `state.files.template` / `state.files.mapping` schéma : `{ tree, meta?, text, name, adapter? }` ✅.
- `window.PARURE_SNIFF(text)` retourne `string | null` ✅.
