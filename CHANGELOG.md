# Changelog

Generated from the git history of `main` by `npm run changelog`. Newest first.
Screenshots of each milestone: [docs/evolution](docs/evolution/README.md). Current state and next steps: [docs/STATUS.md](docs/STATUS.md).

## 2026-10-16

- `954e50a` Merge 0.2.0 core product experience
- `fe6c951` Record product checks and clean desktop and narrow screenshots
- `d908f1a` Clarify local model connection failures
- `79a8b83` Package 0.2.0 with installation guides and repeatable product checks
- `6cc1306` Guide first installation and focus settings by section
- `45388ea` Expose the built-in Assistant in the sidebar
- `8c29dd8` Render the dashboard while model connections load
- `004db45` Make compact dashboard tools usable and preserve note input
- `603e523` Open web addresses directly from shared search
- `0200a12` Record deployed fixes and live browser verification
- `0bb4b51` Changelog for the codebase and UI fixes
- `c8983ae` Merge codebase and UI fixes
- `df9b923` Expose model connections, instructions and MCP management in settings
- `de6a3b8` Keep stopped chat runs out of new conversations and tool calls
- `88e6ef9` Fix themed controls, Customize navigation and narrow-screen overflow
- `9b754ec` End new-tab listeners and observers when a render is replaced
- `21559a8` Import partial setups safely and preserve their selected parts
- `77bab66` Migrate older settings without crashing or changing their source
- `ead9b01` Keep settings saves when sync storage exceeds its quota
- `8bc9fd0` Changelog
- `3df8cfb` STATUS: deployed to the owner's Aside and checked live
- `a3f1ada` Changelog for the 2026-10-16 merge
- `1ee0a8e` STATUS: audit decisions, phase plan and where work stopped; Gmail milestone screenshot
- `3598f2b` identity permission for sign-in windows; Chrome 130 and Firefox 148 minimums

## 2026-10-14

- `20e53e2` Remove 265 CSS selectors that can never match, and a test that keeps it that way
- `0b40c50` Delete dead TypeScript found by the audit
- `46a8528` Changelog is regenerated on main after a merge, not on every commit
- `988e9e2` CI: typecheck, tests and a Chrome build on every push; one version number
- `aae3fce` Removing a widget in arrange mode no longer freezes the top bar
- `a236fc2` Customize › Reset layout redraws the grid
- `79ecde9` Saved new-tab layout, folder colours and active space survive loading
- `51b363d` Gmail runs signed in inside the sidebar frame
- `1bc4524` Point agents at the local full-session context folder (git-ignored)
- `c2b0ed3` Shared pre-commit hook keeps CHANGELOG.md current and reminds about status and screenshots
- `e5f0059` AGENTS.md: do not pin the test count
- `d354617` Project history: milestone screenshots, changelog, and a snap command
- `7d83c55` WIP: run Gmail and X inside sidegig frames; agent guide and status handoff
- `11c528c` Sidebar apps that fit, Arc-style rail plates, one rail per page, nothing over what you click
- `c3d1162` Steady rendering, and an AI chat built into the new tab

## 2026-10-13

- `44f1e03` A desk on one grid, readable Clear widgets, simpler theming, pocket folders, arrange mode
- `05b80da` Working objects on every widget, an Add widgets list, settings redesign and a Size setting
- `45a0075` Crisp text, consistent icons, no shadows, an Anatomy timer
- `e3cac23` New tab dashboard: day widgets, one Search/AI box, bookmarks grid with folders, glass cards
- `da1286a` Collections from your own pictures (albums), tall pictures shown whole, search focus ring fix
- `ef166c6` Scales with your screen, centred layout, Gmail/X in a docked side window, setups you can carry to any browser
- `bb979a2` Readable new tab: larger type and controls, contrast fixed on every theme; your own name on the page
- `e8d1724` New tab scrolls again: it inherited the sidebar's body overflow:hidden and fixed height
- `ea995e6` Wallpaper collections, studio effects, picture themes; icon and drawer fixes from live testing
- `059eaa5` New tab: 11 themes, Customize panel, backgrounds and custom uploads
- `50376d1` New tab NTP-1: Match-browser looks (Chrome, Edge, Aside/Dia/Comet/Arc incl. Arc space colours, Opera, Brave, Vivaldi, Firefox) plus studio looks (Paper, Night, Ultramarine); Home | AI switch with browser-native AI (Aside, Copilot, Leo, Gemini, Perplexity), chats from history, Dia-style tab context; optional new tab with first-run choice and instant hand-back; Mynt-inspired tools: greeting, analog clock, Open-Meteo weather, engine picker, voice typing, to-do with daily reset, Google apps launcher, add shortcut, accent, wallpaper; bundled Barlow Condensed + IBM Plex Mono; no-flash boot
- `b5f6d12` New tab edition: a short, finite issue picked from your interests (filled in by your AI via one prompt read back by the bridge), nine free keyless sources, weighted ranking and composition, save/dismiss learning with fade, Saved shelf, Interests editor, on-device AI review, settings and privacy docs, tests on real-response fixtures
- `43a3ac3` Dock: narrow full-width fixed bars that follow the page shift, release stale shifts, decide html positioning once (fixes YouTube masthead/guide)
- `e77d3dd` Opera-style docking and panel: rail docks and pages make room (fixed elements moved clear), apps open beside the buttons list in the sidebar panel, page rail steps aside when the panel opens on its side, side-mismatch hint, frame rules fixed for side panels, Trusted Types-safe rail

## 2026-10-11

- `aaa80a3` Rename to sidegig and refine: Chrome design system (Google Sans Flex, Material Symbols), page-adaptive theme by default, AI picker, add-this-site, Dia-style tab groups, preloaded drawer, settings navigation
- `87e183b` Margin v0.1: hover rail, apps in the browser sidebar, one-tap AI, bookmark stacks, search, status cards, workspaces, link rules, new tab, theme engine, cross-browser builds
