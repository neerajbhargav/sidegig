# sidegig

**A free, open-source sidebar for every browser.** Touch the edge of any page and sidegig slides in: your apps, one-tap AI, bookmark stacks, search across everything, and quiet status cards. Move away and it's gone.

No account. No servers. No analytics. Works in Chrome, Edge, Brave, Arc, Dia, Vivaldi, Opera, Aside, Firefox and Safari.

<p>
<img src="docs/screenshots/drawer-home.jpg" width="49%" alt="sidegig drawer with bookmark stacks and grouped tabs">
<img src="docs/screenshots/status-dark.jpg" width="49%" alt="Status cards on a dark site">
</p>

## Why

Opera's sidebar proved how good it is to keep messengers and tools one click away. Arc and Dia showed how calm a browser can feel. Most sidebar extensions today either open a second browser pane on the right or put features behind a subscription. sidegig is built to be:

- **Quick.** The rail is drawn on the page itself, appears after a 120 ms touch of the edge, and the drawer is preloaded so it opens instantly.
- **Always there, like Opera's sidebar.** Docked by default: the rail sits flush on the side you choose and every page makes room for it, so nothing is ever covered. Prefer more space? Switch to hover.
- **Customizable.** Any site as an app, any bookmark folder as a space, theme from three inputs, custom CSS, per-site hiding, link rules.
- **Adaptive.** By default it matches each website's light or dark look. Text contrast is checked by tests at every setting.
- **Minimal and good looking.** Chrome's own design language: Google Sans Flex, Material Symbols, tonal surfaces, nothing loud until it has something to say.
- **Free for everyone.** GPL-3.0. No paid tier, ever.

## Features

| | |
|---|---|
| **Docked rail** | Always visible on the left or right, and the page makes room for it like Opera's sidebar: fixed headers, side navs and overlays are moved clear of it automatically (tested on YouTube, X, Gmail, LinkedIn, GitHub, Wikipedia). Opening the drawer makes room too. Or switch to hover, where it slides over the page from the edge. |
| **Opera-style panel** | Apps open in the browser's sidebar laid out like Opera: buttons list on the outer edge, the app right beside it. When the panel opens on the rail's side, the page rail steps aside so it reads as one sidebar. If the browser puts its sidebar on the other side, sidegig offers a one-click fix. |
| **Apps** | Claude, ChatGPT, Gemini, Perplexity, Grok, WhatsApp, Telegram, Slack, Discord, Gmail, Calendar, YouTube Music, Spotify, Notion, Linear, GitHub and more, or any site. Opens in the browser's own sidebar (where your sign-ins work), a slim mini window, a tab, or an in-page drawer. Unread badges from page titles. |
| **Add this site** | The **+** on the rail turns the page you're on into a rail app or a bookmark in one tap, with suggested apps below. |
| **One-tap AI** | The sparkle sends the page, or your selection, to your default AI. Hover it to pick Claude, ChatGPT, Gemini, Perplexity or Grok instead. Uses the account you're already signed in to: no API keys, no extra cost. sidegig types the prompt; you press send (or turn on auto-send). Also in the right-click menu. |
| **Bookmark stacks** | Your real browser bookmarks: folders become Dia/Arc-style stacks with overlapping site icons, loose bookmarks become an Opera-style icon grid. Pick folders as spaces. Syncs through the browser; stays yours if you uninstall. |
| **Tabs, Dia style** | This window's tabs with Chrome tab groups shown as colored sections. Close, switch, put background tabs to sleep, save the window as a workspace and restore it later. |
| **Search everything** | Open tabs, apps, bookmarks (with folder paths), history and commands in one fuzzy-matched list, plus web search. |
| **Status cards** | GitHub reviews and notifications, Vercel deployments, unread Gmail. Faded until something changes, then marked new; the rail glows. |
| **Link rules** | Send links for chosen sites to a mini window, or reuse a tab that's already open. |
| **New tab page** | Search box, apps, a speed dial of saved sites and your stacks. |
| **Theme engine** | Base tint, accent and contrast generate the whole palette in OKLCH. Light, dark, system, or Page (match each site). Corner radius and custom CSS too. |

<p>
<img src="docs/screenshots/ai-picker.jpg" width="32%" alt="AI picker">
<img src="docs/screenshots/add.jpg" width="32%" alt="Add this site">
<img src="docs/screenshots/settings.jpg" width="34%" alt="Settings">
</p>

![New tab page](docs/screenshots/newtab.jpg)

## Install from source

```bash
git clone git@github.com:neerajbhargav/sidegig.git && cd sidegig
npm install
npm run build          # dist/chrome, dist/opera, dist/firefox, dist/safari
```

| Browser | How |
|---|---|
| Chrome, Edge, Brave, Arc, Dia, Vivaldi, Aside and other Chromium browsers | `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → choose `dist/chrome` |
| Opera | `opera://extensions` → Developer mode → Load unpacked → `dist/opera` (sidegig also shows up in Opera's own sidebar) |
| Firefox | `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → `dist/firefox/manifest.json` |
| Safari | `npm run safari` (needs Xcode), then build the generated project and enable sidegig in Safari settings |

`npm run zip` also writes store-ready zips to `dist/`.

## Shortcuts

| | Windows / Linux | Mac |
|---|---|---|
| Show or hide the rail | `Alt+Shift+S` | `⌥⇧S` |
| Search everything | `Alt+Shift+K` | `⌥⇧K` |
| Ask AI about the page or selection | `Alt+Shift+A` | `⌥⇧A` |

Inside the drawer, `⌘K` / `Ctrl+K` jumps to search and `Esc` closes. Change shortcuts on your browser's extension shortcuts page.

## How it works

```
src/
  content/rail.ts      the hover rail, in a closed shadow root on every page (built lazily)
  content/bridge.ts    runs inside app sites: unread badges, typing AI prompts
  background/          opens apps, network rules, menus, alarms, status cards, workspaces
  ui/                  sidegig's pages: in-page drawer, browser sidebar panel, new tab
  options/             settings page
  shared/              theme engine, fuzzy search, storage, app catalog, rules, icons
scripts/               build (esbuild), per-browser manifests, asset fetching
test/                  node:test unit tests
```

- **Why draw the rail on the page instead of only using the browser's side panel?** Extensions can't draw in the browser's own window frame, and the side panel can't be narrower than 320 px or open on hover. A rail drawn on the page can be slim and instant. It can't appear on browser-internal pages (settings, extension stores, the PDF viewer); use the shortcut or toolbar button there.
- **How docking works.** The page's root element gets a margin the width of the rail. Fixed-position elements don't follow that margin, so `src/content/dock.ts` finds the ones that would land under the rail and moves or narrows just those with tagged stylesheet rules, re-checking as the page changes. The geometry lives in `src/shared/dockmath.ts` with unit tests. Sites that still misbehave can be set to float instead.
- **Why do apps open in the browser's sidebar?** Inside a normal web page, sites like Claude or WhatsApp count as embedded third parties and look signed out. In the browser's sidebar they keep your sign-in. sidegig lets them load there by adjusting frame-blocking headers *only for frames inside its own panel* (requests not tied to a browser tab), never for your normal browsing. Tests enforce that the rules never apply to top-level pages.
- **Cross-browser.** Chrome-family browsers use the side panel API, Opera and Firefox their sidebar API, Safari a mini window. One codebase, four generated manifests.

## Design system

- **Type:** Google Sans Flex (SIL OFL), Latin subset, 36 KB, bundled.
- **Icons:** Material Symbols Rounded (Apache-2.0), fetched by `scripts/fetch-assets.mjs`.
- **Color:** three inputs to an OKLCH palette, Linear-style; Google blue `#0b57d0` by default; neutral surfaces; contrast tested (body text ≥ 7:1, secondary ≥ 4.5:1).
- **Shape and motion:** 10 px radius, soft elevation only on floating surfaces, 120–220 ms transitions, respects reduced motion.

## Privacy

See [PRIVACY.md](PRIVACY.md) for exactly what is stored and which requests are made. Short version: nothing leaves your browser except requests to the sites and accounts you choose.

## Development

```bash
npm test         # unit tests (node:test)
npm run check    # TypeScript
npm run build    # all browsers, or build:chrome / build:firefox / build:opera / build:safari
npm run preview  # UI bundle with mocked browser APIs, used for screenshots
node scripts/fetch-assets.mjs   # refresh icons and font
```

The build uses native esbuild when it can and falls back to the WebAssembly build automatically.

## Known limitations

- Some sites refuse to work inside any frame; use "Open as mini window" for those.
- A few sites keep a separate sign-in inside the sidebar; signing in once there fixes it.
- Two accounts of the same app side by side needs Firefox containers (planned).
- Status cards for Claude Code / Codex usage need a small native helper (planned).

## License

[GPL-3.0-or-later](LICENSE). Bundled font and icons are covered by their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
