# Changelog

Generated from the git history of `main` by `npm run changelog`. Newest first.
Screenshots of each milestone: [docs/evolution](docs/evolution/README.md). Current state and next steps: [docs/STATUS.md](docs/STATUS.md).

## 2026-10-23

- `dfb184a` Merge pull request #1 from neerajbhargav/upgrade/oct-2026
- `7272279` Docs: results, security table, STATUS for the fixes
- `33a1ecf` Evals: first injection run, 20 pages, 1 run each
- `12a8bd3` Drop "every browser"; call Codex the CLI
- `9b49e9e` Injection eval: count tool calls written as text
- `680bae6` Injection eval: a no-defense condition; 20-page subset
- `0c861c3` Commit the held-out drafts and how labels changed
- `326e8bc` Write invisible characters as escapes in source
- `35bc42f` Injection eval: one-line asks; OLLAMA_URL
- `d82c490` Evolution: the ask setting stays on this device
- `58bbfdc` Add a 100-page injection corpus and its runner
- `7642a42` Evals: re-run at 3f1c43a with deltas
- `3f1c43a` Eval: paired deltas and the false-code rate
- `34c7a87` Close the drawer ports that never answer
- `1ad2661` CI: one run per change; e2e never reuses a server
- `018e2b4` Release: no write token near npm ci; run e2e first
- `171d6f7` Eval: --rev scores later commits; --misses only dev
- `160de5e` Do not read zipcode, barcode or postcode as a code
- `ce44957` Test the real ask-before-sending wiring; keep it local
- `9269a61` Fold hidden and lookalike tags before neutralizing
- `965c2c2` STATUS: README rewrite, release check, eval re-run
- `11e7e49` README for a quick scan; feature tour to docs
- `71df227` README screenshots after the Arc redesign
- `d00f1e5` Record a README tour GIF from the preview
- `f0e08db` Evals: re-run the code detector after the merge
- `2f260f5` STATUS: main merged in, checks after the merge
- `209080c` README: design lines after the Arc redesign
- `952ea4a` Restyle the ask-before-sending prompt after Arc
- `706beab` Merge main (Arc redesign, 0.4.0) into upgrade
- `f64e4d9` STATUS: extensions page address
- `0cfaba6` STATUS: 0.4.0 and the Arc redesign merged, pushed and installed in Aside
- `2f0ac56` Changelog for 0.4.0 and the Arc redesign
- `8985b1b` Merge the premium product pass (0.4.0) and the Arc redesign
- `abae585` Evolution: Arc redesign before and after; picker drag listeners and slider value
- `b0a4e4d` Redesign after Arc: space colour frame, content cards, lift, system type

## 2026-10-22

- `55e8953` Point the smoke scripts at npm run e2e
- `943ba63` STATUS: pushed for review as PR #1
- `8390413` Docs: Playwright checks, lint, release, STATUS
- `72ee294` Publish the browser zips on version tags
- `f5387b3` Complete the third-party notices
- `ba4b8ad` Lint with Biome and fix what it found
- `615bb81` Check the extension and preview in Playwright
- `328ab58` Open the drawer's port at its real origin
- `0dc392c` Docs: eval results, injection defenses, STATUS
- `d89fe8e` Score sign-in codes on a held-out set

## 2026-10-21

- `eddf145` Ask before sending page data out (opt-in setting)
- `ed425f1` Keep untrusted text inside its page and email wrappers
- `07fea22` Find sign-in codes only next to a code word
- `c271d07` Record the sign-in code baseline: P 70.1%, R 88.9%
- `279374e` Add a labeled corpus and eval for sign-in codes
- `5519e50` STATUS: scrub done, merge waits for the owner
- `2d74be3` List Barlow and Plex Mono in third-party notices
- `c6769da` Blur private text in early evolution shots
- `0ce67cc` Fixture screenshots and an honest browser table
- `c992737` Use neutral examples in test fixtures
- `b670e28` Remove unused local in the Customize layout tab
- `dd7fbe6` STATUS: design system deployed to Aside and live-checked
- `8761b3e` Evolution: layout fix and design system, before and after (fixture desk)
- `77ce138` One design system for every surface, enforced by a test
- `32fe690` Fix the new tab layout and sidebar app loading jank
- `d01acb1` STATUS: review outcome, mute verification, sharp icons closed
- `9b2a331` Fixes from the Codex review
- `f1196af` Revert sharp touch icons: the trigger could never fire
- `45fba62` Trailing blank line in ntdata.ts
- `99bc0c2` STATUS: 0.4.0 premium pass, live checks, the reinstall incident and open work
- `cf9cb3d` Sharp app icons: the site's own touch icon when the cached one is small
- `cb1816f` Screenshots and design notes for 0.4.0
- `ce7f527` Opt-in weekly backup to Downloads that survives removing the extension
- `8e016e9` Document mail, agents and the new desk details; ship the bridge in packages
- `907ae54` Settings page applies changes to the latest stored settings; 0.4.0
- `354f07f` Drawer behind Chrome's per-session random URL (from drawer-dynamic-url)
- `a6c5e6e` Sender trust and the drawer channel work with a per-session drawer host
- `5debe04` Setup as a numbered step rail; sign-in codes as tickets; outline counts
- `6626816` Desk details from the owner's X bookmarks
- `67eb760` New stacks and spaces in sidegig; per-app mute; panel window fallback
- `74e2bca` Agents can use the browser through the bridge, as far as you allow
- `2400d18` List rows start-aligned again; compact mail actions; mail preview scene
- `a016725` Mail layer: sign-in code pills, thread summaries and reply drafts
- `fb05a78` Arrow keys move along the rails; touch-size targets; calm refresh spinner
- `f459d39` Opera's sidebar badge shows the unread total
- `8e8f218` Apps can keep running while hidden
- `b5d87d2` Link rules can open links in the sidebar
- `1d12692` Each app remembers its drawer and side-window width
- `a1ea113` Assistant on the page rail; ask it about selected text; working Weather switch
- `4cc3d5a` Bridge: pairing code on every connection, frame limits, owned runs
- `f808cf3` Frame-header rule for app navigations covers only sidegig's frames
- `b8f8e1f` Rail and drawer talk over a private MessageChannel
- `dd8d6e6` Trust message senders, not hosts named inside messages

## 2026-10-17

- `0cca2ee` Record 0.3.0 installed verification and remaining product work
- `c86232f` Changelog for the native panel lifecycle repair
- `b329b14` Merge native panel lifecycle repair
- `48f152c` Record the restored dock state after native panel closure
- `945a9d1` Restore page rails immediately when native panels close
- `9796587` Changelog for 0.3.0 refinements
- `fa7a2f5` Merge 0.3.0 adaptive desk and dock refinements
- `c753628` Record clean 0.3.0 desktop, sidebar and customization screenshots
- `387d99b` Refine the adaptive desk, dock and core product flows for 0.3.0

## 2026-10-16

- `a4d2da6` Record 0.2.0 deployment and live verification
- `93a1488` Changelog for the 0.2.0 product iteration
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
