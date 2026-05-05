window.PARURE_SNIFF = function sniff(text) {
  const trimmed = text.trimStart();

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

  if (lines[0].trim() === '---') return 'yaml';

  const tomlSectionRe = /^\[[\w.-]+\]\s*$/;
  if (lines.some((l) => tomlSectionRe.test(l.trim()))) {
    return 'toml';
  }

  const envRe = /^[A-Z_][A-Z0-9_]*\s*=/;
  const envCount = lines.filter((l) => envRe.test(l.trim())).length;
  if (envCount / lines.length >= 0.7) return 'env';

  const propRe = /^[a-zA-Z][\w.-]*\s*[:=]/;
  const propCount = lines.filter((l) => propRe.test(l.trim())).length;
  if (propCount / lines.length >= 0.7) return 'properties';

  return null;
};
