# Parure — Contraintes techniques

## Stack imposée

- **Vanilla JS** uniquement. Pas de framework JS (React, Vue, Svelte, Alpine…).
- **Pas de build step.** HTML + CSS + JS purs servis statiquement.
- **Tailwind via CDN** pour le style : `<script src="https://cdn.tailwindcss.com"></script>`.
- **Animations en CSS pur** (transitions, `@keyframes`). Pas de lib d'animation (Framer, GSAP, Anime.js…).
- **100 % client-side.** Aucun backend. Aucune dépendance npm.
- Déploiement : **GitHub Pages**.

## Périmètre LOT 1 (cf. QCD.md, ne pas dépasser)

- Format de config supporté : **JSON uniquement**. Tout autre input → message d'erreur clair, pas de fallback silencieux.
- Variables auto-générées : `${VAR_1}`, `${VAR_2}`, … numérotation incrémentale dans l'ordre d'apparition.
- Fichier de correspondance : JSON `{ "VAR_1": "valeur_originale", … }`.
- L'échappement des caractères spéciaux est délégué à `JSON.parse` / `JSON.stringify` natifs — ne pas réimplémenter à la main.

## Anti (LOT 1)

- Pas de TypeScript, pas de bundler (Vite, Webpack, esbuild…).
- Pas de tests automatisés.
- Pas de support multi-format (YAML, .env, TOML…) → LOT 2.
- Pas de polish au-delà des animations CSS ciblées (drop zone, fade-in résultat, transition modes, feedback "copié").
- Pas de mobile / Safari / Firefox prioritaires → cible Chrome desktop.
