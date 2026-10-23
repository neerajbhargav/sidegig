# sidegig agent guide

sidegig is a free, open-source (GPL-3.0) browser extension. It adds an Opera-style sidebar (a rail of apps, an app drawer, AI chat, bookmark stacks, status cards) and an optional new tab page (a widget desk on one grid, wallpapers, an AI assistant). Targets: Chromium browsers (Chrome, Edge, Brave, Arc, Dia, Vivaldi, Aside), Opera, Firefox, Safari. Owner: Neeraj (GitHub `neerajbhargav`).

## Start of every session

1. Read `docs/STATUS.md`. It says where work stopped, the open work in priority order, and the decisions to keep.
   When STATUS.md does not explain why something was built a certain way, what the owner asked for, or what was already tried, read `context/README.md`. It holds the full transcript of the build session (local only, never commit it).
2. Run `git status` and `git branch`. Several agents (Aside, Claude Code, Codex, Cursor, Gemini, Hermes) can work in this folder. Continue on the current work branch, or make a new branch for a new task. Merge to `main` and push only when the owner asks.

## End of every session: keep the folder fresh

The session is done only when all four hold:

1. `docs/STATUS.md` "Where work stopped" and "Open work" describe the code as you leave it, with today's date on the "Last updated" line.
2. Every visible change has a screenshot in `docs/evolution`: `npm run snap -- <image> "<caption>"`. It resizes the image and adds it to `docs/evolution/README.md` under the current commit. Before you add an image, crop or blur private text: to-do items, emails, inbox rows, chat titles, other people's posts. Clean shots come from the preview (fixtures, no personal data).
3. The shared pre-commit hook (`.githooks/pre-commit`) reminds you about steps 1 and 2. If `git config core.hooksPath` is not `.githooks`, run `npm install` or that command once. `CHANGELOG.md` is regenerated only on `main`, right after a merge: `npm run changelog`, then commit it.
4. The work is committed on its branch. Push the branch if it already tracks `origin`.

## Commands and their gotchas

- npm scripts are in `package.json`. Typecheck: `npx tsc --noEmit -p .`. Tests: `npm test` (`node --test` with TypeScript stripping; all must pass). Build one target: `node scripts/build.mjs chrome` (output `dist/chrome`). All targets plus zips: `node scripts/build.mjs --zip`.
- Lint: `npm run lint` (Biome; each rule turned off has its reason in `biome.jsonc`). End-to-end: `npm run e2e` (Playwright) after `npm run build:chrome && npm run preview`; it reads `dist/`, so a stale build tests stale code. On this Mac the cached Playwright Chromium carries a quarantine flag and hangs at launch: use `E2E_CHANNEL=chrome` (installed Google Chrome) or install Chromium into a fresh `PLAYWRIGHT_BROWSERS_PATH`.
- If npm fails on this Mac, run it as `env -u NPM_CONFIG_PREFIX -u NPM_CONFIG_USERCONFIG -u NODE_PATH -u NPM_CONFIG_CACHE npm ...`. Node lives in `/opt/homebrew/bin`; add it to `PATH` if `node` is missing.
- esbuild's native binary can be killed by a sandbox; the build falls back to esbuild-wasm on its own.
- Generated files: `src/ui/figures/*.ts` come from `node scripts/build-figures.mjs` (Anatomy kit in `vendor/anatomy`). Brand icons come from `scripts/fetch-brands.mjs`; Material Symbols and fonts from `scripts/fetch-assets.mjs`. Edit the scripts, not the output.
- Preview without a browser extension: `node scripts/build.mjs preview`, then serve `dist/` (`python3 -m http.server 8765 --bind 127.0.0.1` from `dist`) and open `http://127.0.0.1:8765/preview/`. The preview fakes `chrome.*` with fixtures.

## Testing in a real browser

- Load `dist/chrome` unpacked at `chrome://extensions` (Developer mode). In the owner's Aside browser the unpacked extension ID is `ajnaogjnifkkkpgkbejfbngakgnhaipp`.
- After a rebuild, reload the extension. Reloading closes the extension's own pages; reopen `panel.html` or `options.html` to test.
- Chrome's side panel can show only extension pages. Third-party apps load in frames named `sidegig-app-<id>` inside those pages.
- Do not change Gmail's user agent; Google then asks the owner to sign in again.

## Code map

- `src/background/`: service worker. `dnr.ts` (header and user-agent rules), `framecookies.ts` (cookie rules for app frames), `open.ts` (side window, tabs), `favicons.ts`, `index.ts` (message router).
- `src/content/`: scripts injected into pages. `rail.ts`/`rail.css` (the docked rail), `dock.ts` (moves page content aside), `framefit.ts` and `framefit-main.ts` (make frame-hostile apps run inside sidegig frames).
- `src/shared/`: logic with tests. `catalog.ts` (built-in apps, `NO_FRAME`, `PHONE_FIT`), `defaults.ts` and `storage.ts` (settings and migrations, `SETTINGS_VERSION`), `layout.ts` (new-tab grid), `legible.ts` (wallpaper contrast), `theme.ts` (colour tokens and the space colour), `ai/` (chat providers, wire formats, MCP client, bridge client, tools).
- `src/ui/`: drawer, panel and new tab. `spacepick.ts` (the space colour picker), `views/newtab.ts`, `views/ntgrid.ts` (grid and arrange mode), `views/ntdash.ts` (widgets), `views/ntchat.ts` (chat UI), `views/ntcustom.ts` (Customize panel), `views/appview.ts` (app frames). Styles in `ui.css`.
- `src/options/`: the settings page. `bridge/sidegig-bridge.mjs`: local helper for Codex and outside agents (not yet tested end to end).

## Rules

- Product and design decisions are listed in `docs/STATUS.md` under "Key decisions". Follow them; ask the owner before changing one.
- UI work uses the design system in `docs/DESIGN.md`: tokens, components and widget anatomy. `test/design.test.ts` fails on a raw value.
- Mark temporary debugging code with the comment `DIAGNOSTIC (temporary)` and remove it before merging to `main`.
- Third-party code needs a licence entry in `THIRD_PARTY_NOTICES.md`. Write AI and site integrations clean-room from public docs.
- To understand a third-party site's shipped scripts (for example why Gmail fails in a frame), use the REA skill (`reverse-engineer-anything`, CLI `rea`): save the page's scripts to a folder, then run `rea analyze-javascript-application <folder>` or search the saved files.
- Git identity for commits: `Neeraj Rondla <268078150+neerajbhargav@users.noreply.github.com>`.
