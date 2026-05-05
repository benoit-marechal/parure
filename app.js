window.PARURE_ADAPTERS = window.PARURE_ADAPTERS || [];
(() => {
  const HISTORY_KEY = 'parure.history.v1';
  const HISTORY_MAX = 50;

  const state = {
    mode: 'anonymize',
    files: { template: null, mapping: null },
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => root.querySelectorAll(sel);

  const els = {
    modeButtons: $$('[data-mode]'),
    modeIndicator: $('#mode-indicator'),
    panes: {
      anonymize: $('[data-pane="anonymize"]'),
      restore: $('[data-pane="restore"]'),
    },
    result: $('#result'),
    toast: $('#toast'),
    toastMsg: $('#toast-msg'),
    cardTemplate: $('#result-card-template'),
    historyToggle: $('#history-toggle'),
    historyCount: $('#history-count'),
    historyDrawer: $('#history-drawer'),
    historyBackdrop: $('#history-backdrop'),
    historyClose: $('#history-close'),
    historyClear: $('#history-clear'),
    historyList: $('#history-list'),
    historyEmpty: $('#history-empty'),
    historyEntryTemplate: $('#history-entry-template'),
    historyInline: $('#history-inline'),
    historyInlineList: $('#history-inline-list'),
    historyInlineMore: $('#history-inline-more'),
    historyInlineTotal: $('#history-inline-more [data-total]'),
  };

  const HISTORY_INLINE_LIMIT = 10;

  function init() {
    setupModeSwitcher();
    setupDropzones();
    setupHistory();
    requestAnimationFrame(() => positionModeIndicator(state.mode));
    window.addEventListener('resize', () => positionModeIndicator(state.mode));
    renderHistory();
  }

  // ---------- Mode switcher ----------

  function setupModeSwitcher() {
    els.modeButtons.forEach((btn) => {
      btn.addEventListener('click', () => switchMode(btn.dataset.mode));
    });
  }

  function switchMode(mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    els.modeButtons.forEach((b) => {
      const active = b.dataset.mode === mode;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
    Object.entries(els.panes).forEach(([key, el]) => {
      el.classList.toggle('hidden', key !== mode);
    });
    positionModeIndicator(mode);
    clearResult();
    if (mode === 'restore') {
      state.files.template = null;
      state.files.mapping = null;
      $$('.dropzone[data-target="template"], .dropzone[data-target="mapping"]').forEach(resetDropzone);
    }
  }

  function positionModeIndicator(mode) {
    const target = Array.from(els.modeButtons).find((b) => b.dataset.mode === mode);
    if (!target) return;
    const parentRect = target.parentElement.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    els.modeIndicator.style.width = `${rect.width}px`;
    els.modeIndicator.style.transform = `translateX(${rect.left - parentRect.left - 4}px)`;
  }

  // ---------- Dropzones ----------

  function setupDropzones() {
    $$('.dropzone').forEach((dz) => {
      ['dragenter', 'dragover'].forEach((evt) =>
        dz.addEventListener(evt, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dz.classList.add('dragover');
        })
      );
      ['dragleave', 'dragend'].forEach((evt) =>
        dz.addEventListener(evt, (e) => {
          e.preventDefault();
          if (e.target === dz || !dz.contains(e.relatedTarget)) {
            dz.classList.remove('dragover');
          }
        })
      );
      dz.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) await handleFile(dz, file);
      });
      dz.addEventListener('click', () => openFilePicker(dz));
      dz.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openFilePicker(dz);
        }
      });
    });
  }

  function openFilePicker(dz) {
    const input = document.createElement('input');
    input.type = 'file';
    const target = dz.dataset.target;
    if (target === 'mapping') {
      input.accept = '.json,application/json';
    } else {
      input.accept = '.json,.yaml,.yml,.toml,.env,.properties,application/json,text/plain,text/yaml';
    }
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (file) await handleFile(dz, file);
    });
    input.click();
  }

  async function handleFile(dz, file) {
    const text = await file.text();
    const target = dz.dataset.target;

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

  function tryParseJSON(text) {
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  function markDropzoneFile(dz, filename) {
    dz.classList.add('has-file');
    const meta = $(`[data-meta="${dz.dataset.target}"]`, dz);
    if (meta) meta.textContent = filename;
  }

  function resetDropzone(dz) {
    dz.classList.remove('has-file');
    const meta = $(`[data-meta="${dz.dataset.target}"]`, dz);
    if (meta) meta.textContent = 'Aucun fichier';
  }

  // ---------- Anonymize / Restore logic ----------

  function runAnonymize(tree, meta, originalText, filename, adapter) {
    const mapping = {};
    const counter = { n: 1 };
    const templated = anonymize(tree, mapping, counter);
    const baseName = stripExt(filename) || 'config';
    const ext = adapter.extensions[0];

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

  function anonymize(value, mapping, counter) {
    if (Array.isArray(value)) return value.map((v) => anonymize(v, mapping, counter));
    if (value !== null && typeof value === 'object') {
      const result = {};
      for (const [k, v] of Object.entries(value)) result[k] = anonymize(v, mapping, counter);
      return result;
    }
    const name = `VAR_${counter.n++}`;
    mapping[name] = value;
    return `\${${name}}`;
  }

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

  function restore(value, mapping) {
    if (Array.isArray(value)) return value.map((v) => restore(v, mapping));
    if (value !== null && typeof value === 'object') {
      const result = {};
      for (const [k, v] of Object.entries(value)) result[k] = restore(v, mapping);
      return result;
    }
    if (typeof value === 'string') {
      const m = value.match(/^\$\{(VAR_\d+)\}$/);
      if (m && Object.prototype.hasOwnProperty.call(mapping, m[1])) {
        return mapping[m[1]];
      }
    }
    return value;
  }

  // ---------- Result rendering ----------

  function showResult(result) {
    clearResult();
    const grid = document.createElement('div');
    grid.className = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';
    const cards = result.mode === 'anonymize'
      ? [
          { file: result.template, title: 'Templaté', badge: { text: 'JSON', cls: '' } },
          { file: result.mapping, title: 'Correspondance', badge: { text: 'CLÉ', cls: 'badge-key' } },
          { file: result.source, title: 'Source originale', badge: { text: 'SRC', cls: 'badge-key' } },
        ]
      : [
          { file: result.restored, title: 'Fichier restauré', badge: { text: 'OK', cls: 'badge-ok' } },
          { file: result.template, title: 'Templaté (entrée)', badge: { text: 'IN', cls: '' } },
          { file: result.mapping, title: 'Correspondance (entrée)', badge: { text: 'IN', cls: '' } },
        ];

    cards.forEach((spec) => {
      const node = els.cardTemplate.content.cloneNode(true);
      const card = node.querySelector('.card');
      $('[data-title]', card).textContent = spec.title;
      $('[data-filename]', card).textContent = spec.file.filename;
      const badge = $('[data-badge]', card);
      badge.textContent = spec.badge.text;
      if (spec.badge.cls) badge.classList.add(spec.badge.cls);
      $('[data-preview]', card).textContent = previewOf(spec.file.content);
      bindCardActions(card, spec.file);
      grid.appendChild(node);
    });

    els.result.appendChild(grid);
    els.result.classList.remove('hidden');
    scrollToResult();
  }

  function bindCardActions(card, file) {
    $('[data-action="download"]', card).addEventListener('click', () => downloadFile(file.filename, file.content));
    $('[data-action="copy"]', card).addEventListener('click', (e) => copyContent(e.currentTarget, file.content));
  }

  function previewOf(text) {
    const max = 4000;
    return text.length > max ? text.slice(0, max) + '\n…' : text;
  }

  function clearResult() {
    els.result.innerHTML = '';
    els.result.classList.add('hidden');
  }

  function scrollToResult() {
    requestAnimationFrame(() => {
      setTimeout(() => {
        els.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    });
  }

  // ---------- History ----------

  function setupHistory() {
    els.historyToggle.addEventListener('click', openDrawer);
    els.historyClose.addEventListener('click', closeDrawer);
    els.historyBackdrop.addEventListener('click', closeDrawer);
    els.historyClear.addEventListener('click', () => {
      if (loadHistory().length === 0) return;
      if (!confirm('Vider tout l\'historique ?')) return;
      saveHistory([]);
      renderHistory();
      showToast('Historique vidé', 'success');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && els.historyDrawer.classList.contains('open')) closeDrawer();
    });
    els.historyInlineMore.addEventListener('click', openDrawer);
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveHistory(history) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      return true;
    } catch (err) {
      // Quota dépassé : on retire les plus vieilles et on retente
      if (history.length > 1) {
        return saveHistory(history.slice(0, Math.floor(history.length / 2)));
      }
      showToast('Stockage local saturé : historique non sauvegardé', 'error');
      return false;
    }
  }

  function pushHistory(result) {
    const history = loadHistory();
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      mode: result.mode,
      ...(result.mode === 'anonymize'
        ? {
            source: result.source,
            template: result.template,
            mapping: result.mapping,
          }
        : {
            restored: result.restored,
            template: result.template,
            mapping: result.mapping,
          }),
    };
    history.unshift(entry);
    const trimmed = history.slice(0, HISTORY_MAX);
    saveHistory(trimmed);
    renderHistory();
  }

  function renderHistory() {
    const history = loadHistory();
    els.historyCount.textContent = String(history.length);
    els.historyCount.hidden = history.length === 0;

    renderEntriesInto(els.historyList, history, { emptyMessage: 'Aucune transformation pour l\'instant.' });

    if (history.length === 0) {
      els.historyInline.classList.add('hidden');
    } else {
      els.historyInline.classList.remove('hidden');
      const inline = history.slice(0, HISTORY_INLINE_LIMIT);
      renderEntriesInto(els.historyInlineList, inline);
      els.historyInlineTotal.textContent = String(history.length);
      els.historyInlineMore.style.display = history.length > HISTORY_INLINE_LIMIT ? '' : 'none';
    }
  }

  function renderEntriesInto(container, entries, opts = {}) {
    container.innerHTML = '';
    if (entries.length === 0) {
      if (opts.emptyMessage) {
        const empty = document.createElement('p');
        empty.className = 'history-empty';
        empty.textContent = opts.emptyMessage;
        container.appendChild(empty);
      }
      return;
    }
    entries.forEach((entry) => {
      const node = els.historyEntryTemplate.content.cloneNode(true);
      const article = node.querySelector('.history-entry');
      const modeEl = $('[data-mode]', article);
      modeEl.textContent = entry.mode === 'anonymize' ? 'Anonymisé' : 'Restauré';
      modeEl.classList.add(`mode-${entry.mode}`);
      $('[data-time]', article).textContent = formatTime(entry.timestamp);
      const sourceName = entry.mode === 'anonymize'
        ? (entry.source && entry.source.filename) || 'config.json'
        : (entry.template && entry.template.filename) || 'template.json';
      $('[data-name]', article).textContent = sourceName;
      const valuesCount = entry.mode === 'anonymize' && entry.mapping
        ? Object.keys(safeParseObject(entry.mapping.content)).length
        : null;
      $('[data-meta]', article).textContent = valuesCount !== null
        ? `${valuesCount} valeur${valuesCount > 1 ? 's' : ''}`
        : '3 fichiers';
      article.addEventListener('click', () => reloadFromHistory(entry));
      article.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          reloadFromHistory(entry);
        }
      });
      container.appendChild(node);
    });
  }

  function safeParseObject(text) {
    try {
      const v = JSON.parse(text);
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch {
      return {};
    }
  }

  function reloadFromHistory(entry) {
    if (entry.mode !== state.mode) {
      // Switch sans clearResult intermédiaire
      state.mode = entry.mode;
      els.modeButtons.forEach((b) => {
        const active = b.dataset.mode === entry.mode;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', String(active));
      });
      Object.entries(els.panes).forEach(([key, el]) => {
        el.classList.toggle('hidden', key !== entry.mode);
      });
      positionModeIndicator(entry.mode);
    }
    showResult(entry);
    closeDrawer();
  }

  function openDrawer() {
    els.historyBackdrop.hidden = false;
    requestAnimationFrame(() => {
      els.historyBackdrop.classList.add('show');
      els.historyDrawer.classList.add('open');
    });
    els.historyDrawer.setAttribute('aria-hidden', 'false');
    els.historyToggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('drawer-open');
  }

  function closeDrawer() {
    els.historyBackdrop.classList.remove('show');
    els.historyDrawer.classList.remove('open');
    els.historyDrawer.setAttribute('aria-hidden', 'true');
    els.historyToggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('drawer-open');
    setTimeout(() => { els.historyBackdrop.hidden = true; }, 320);
  }

  function formatTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return `Aujourd'hui · ${time}`;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `Hier · ${time}`;
    const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    return `${date} · ${time}`;
  }

  // ---------- Helpers ----------

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function stripExt(name) {
    return name.replace(/\.(json|ya?ml|toml|env|properties)$/i, '');
  }

  function downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 100);
    showToast(`Téléchargé : ${filename}`, 'success');
  }

  async function copyContent(btn, text) {
    try {
      await navigator.clipboard.writeText(text);
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1500);
    } catch {
      showToast('Impossible de copier dans le presse-papier', 'error');
    }
  }

  let toastTimer = null;
  function showToast(msg, kind = 'success') {
    els.toastMsg.textContent = msg;
    els.toast.classList.remove('error', 'success');
    els.toast.classList.add('show', kind);
    els.toast.setAttribute('aria-hidden', 'false');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.classList.remove('show');
      els.toast.setAttribute('aria-hidden', 'true');
    }, 2400);
  }

  ['dragover', 'drop'].forEach((evt) =>
    window.addEventListener(evt, (e) => e.preventDefault())
  );

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
