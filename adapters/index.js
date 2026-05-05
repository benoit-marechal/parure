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
