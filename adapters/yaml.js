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
    serialize(tree, _meta) {
      return jsyaml.dump(tree, { lineWidth: -1, noRefs: true, quotingType: '"' });
    },
  });
})();
