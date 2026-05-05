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
