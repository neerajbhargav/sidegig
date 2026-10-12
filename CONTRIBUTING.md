# Contributing

Thanks for helping make Margin better.

1. `npm install`, then `npm test` and `npm run check` should both pass.
2. Keep the rail light: it runs on every page. Nothing heavy in `src/content/rail.ts`, and no UI frameworks there.
3. Keep it quiet: new UI should stay out of the way until someone reaches for it.
4. No telemetry, no remote code, no new servers. Ask for permissions only when a feature needs them (use optional permissions where possible).
5. New logic in `src/shared` or `src/background` should come with a `node:test` test in `test/`.
6. Test in at least one Chromium browser and Firefox before opening a pull request.

By contributing you agree your work is released under GPL-3.0-or-later.
