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
    serialize(tree, _meta) {
      return window.TOML.stringify(tree);
    },
  });
})();
