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
