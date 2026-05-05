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