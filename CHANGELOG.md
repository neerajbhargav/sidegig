# Changelog

Generated from the git history of `main` by `npm run changelog`. Newest first.
Screenshots of each milestone: [docs/evolution](docs/evolution/README.md). Current state and next steps: [docs/STATUS.md](docs/STATUS.md).

## 2026-10-31

- `a237f30` Fix two Assistant bugs found live: hide a built-in model that only echoes, let Ollama accept sidegig
- `278dd3b` STATUS: v0.4.2 published, backup location
- `ada492e` Release 0.4.2: changelog and STATUS after the history rewrite
- `249b4b4` 0.4.2: store listing kit, MP4 tour for X, full-length tour GIF
- `c419c2d` Launch readiness: install-first README, blank calculator start, SECURITY.md, issue templates, social preview

## 2026-10-27

- `63c01ab` Merge pull request #3 from neerajbhargav/docs/polish-2026-10-27
- `6b173e9` README: link the v0.4.1 release

## 2026-10-23

- `80dc326` Merge pull request #2 from neerajbhargav/release/0.4.1
- `6f0b927` Release 0.4.1: changelog and STATUS after PR #1
- `827545a` Merge pull request #1 from neerajbhargav/upgrade/oct-2026
- `abe91eb` Docs: results, security table, STATUS for the fixes
- `e8084f1` Evals: first injection run, 20 pages, 1 run each
- `8b9e9d4` Drop "every browser"; call Codex the CLI
- `516cc65` Injection eval: count tool calls written as text
- `763b030` Injection eval: a no-defense condition; 20-page subset
- `cfe7cdb` Commit the held-out drafts and how labels changed
- `5130dc7` Write invisible characters as escapes in source
- `8ba2352` Injection eval: one-line asks; OLLAMA_URL
- `99adf22` Evolution: the ask setting stays on this device
- `b35a029` Add a 100-page injection corpus and its runner
- `08ed86e` Evals: re-run at 235b1e4 with deltas
- `235b1e4` Eval: paired deltas and the false-code rate
- `50facb5` Close the drawer ports that never answer
- `c4f0162` CI: one run per change; e2e never reuses a server
- `99e0a64` Release: no write token near npm ci; run e2e first
- `5ca7b53` Eval: --rev scores later commits; --misses only dev
- `694ae8b` Do not read zipcode, barcode or postcode as a code
- `57adaae` Test the real ask-before-sending wiring; keep it local
- `afe1713` Fold hidden and lookalike tags before neutralizing
- `1ee615d` STATUS: README rewrite, release check, eval re-run
- `b615887` README for a quick scan; feature tour to docs
- `897154e` Record a README tour GIF from the preview
- `35db3b7` Evals: re-run the code detector after the merge
- `a3d62ac` STATUS: main merged in, checks after the merge
- `662feb4` README: design lines after the Arc redesign
- `e75dcee` Restyle the ask-before-sending prompt after Arc
- `7214fc0` Merge main (Arc redesign, 0.4.0) into upgrade
- `013333a` STATUS: extensions page address
- `1e52b11` STATUS: 0.4.0 and the Arc redesign merged, pushed and installed in Aside
- `7c08391` Changelog for 0.4.0 and the Arc redesign
- `a899fb4` Merge the premium product pass (0.4.0) and the Arc redesign
- `223fe19` Evolution: Arc redesign before and after; picker drag listeners and slider value
- `c9e0a30` Redesign after Arc: space colour frame, content cards, lift, system type

## 2026-10-22

- `0339926` Point the smoke scripts at npm run e2e
- `0c36ca8` STATUS: pushed for review as PR #1
- `6de38b1` Docs: Playwright checks, lint, release, STATUS
- `e7f89c1` Publish the browser zips on version tags
- `6666220` Complete the third-party notices
- `c8586ad` Lint with Biome and fix what it found
- `8139eb8` Check the extension and preview in Playwright
- `4eb24e9` Open the drawer's port at its real origin
- `45668d9` Docs: eval results, injection defenses, STATUS
- `cddb847` Score sign-in codes on a held-out set

## 2026-10-21

- `9e022ee` Ask before sending page data out (opt-in setting)
- `825a5dd` Keep untrusted text inside its page and email wrappers
- `232a9e7` Find sign-in codes only next to a code word
- `ef2ace5` Record the sign-in code baseline: P 70.1%, R 88.9%
- `6297b41` Add a labeled corpus and eval for sign-in codes
- `dae2f86` STATUS: scrub done, merge waits for the owner
- `8099380` List Barlow and Plex Mono in third-party notices
- `4f00ad7` Fixture screenshots and an honest browser table
- `024c7a0` Use neutral examples in test fixtures
- `50fd853` Remove unused local in the Customize layout tab
- `83e6ee3` STATUS: design system deployed to Aside and live-checked
- `49b1582` Evolution: layout fix and design system, before and after (fixture desk)
- `564c760` One design system for every surface, enforced by a test
- `5f962a2` Fix the new tab layout and sidebar app loading jank
- `9c460cc` STATUS: review outcome, mute verification, sharp icons closed
- `0c43bb7` Fixes from the Codex review
- `43e0a68` Revert sharp touch icons: the trigger could never fire
- `8bd2a03` Trailing blank line in ntdata.ts
- `f9564b7` STATUS: 0.4.0 premium pass, live checks, the reinstall incident and open work
- `72ef5ef` Sharp app icons: the site's own touch icon when the cached one is small
- `1671144` Screenshots and design notes for 0.4.0
- `9f6f4a3` Opt-in weekly backup to Downloads that survives removing the extension
- `b787aa4` Document mail, agents and the new desk details; ship the bridge in packages
- `20a5c8a` Settings page applies changes to the latest stored settings; 0.4.0
- `3b2a5f1` Drawer behind Chrome's per-session random URL (from drawer-dynamic-url)
- `cd55750` Sender trust and the drawer channel work with a per-session drawer host
- `1f0e5f5` Setup as a numbered step rail; sign-in codes as tickets; outline counts
- `7adadbc` Desk details from the owner's X bookmarks
- `700fde3` New stacks and spaces in sidegig; per-app mute; panel window fallback
- `ad817f9` Agents can use the browser through the bridge, as far as you allow
- `cd51e0f` List rows start-aligned again; compact mail actions; mail preview scene
- `565427d` Mail layer: sign-in code pills, thread summaries and reply drafts
- `f3a894c` Arrow keys move along the rails; touch-size targets; calm refresh spinner
- `69c6b89` Opera's sidebar badge shows the unread total
- `56ae773` Apps can keep running while hidden
- `e7e00d1` Link rules can open links in the sidebar
- `bbecef4` Each app remembers its drawer and side-window width
- `40273de` Assistant on the page rail; ask it about selected text; working Weather switch
- `c7073f3` Bridge: pairing code on every connection, frame limits, owned runs
- `e02f8ef` Frame-header rule for app navigations covers only sidegig's frames
- `d0068a5` Rail and drawer talk over a private MessageChannel
- `fa5bca9` Trust message senders, not hosts named inside messages

## 2026-10-17

- `1170c62` Record 0.3.0 installed verification and remaining product work
- `9c1a66a` Changelog for the native panel lifecycle repair
- `e2b50ab` Merge native panel lifecycle repair
- `82fdafc` Record the restored dock state after native panel closure
- `48763b0` Restore page rails immediately when native panels close
- `9a6bae7` Changelog for 0.3.0 refinements
- `bd2afa8` Merge 0.3.0 adaptive desk and dock refinements
- `acd78af` Record clean 0.3.0 desktop, sidebar and customization screenshots
- `33a4c40` Refine the adaptive desk, dock and core product flows for 0.3.0

## 2026-10-16

- `17a0233` Record 0.2.0 deployment and live verification
- `06a8406` Changelog for the 0.2.0 product iteration
- `25674fd` Merge 0.2.0 core product experience
- `47f3848` Record product checks and clean desktop and narrow screenshots
- `c19dda3` Clarify local model connection failures
- `8624fcc` Package 0.2.0 with installation guides and repeatable product checks
- `74a597e` Guide first installation and focus settings by section
- `4e188ac` Expose the built-in Assistant in the sidebar
- `b0e6798` Render the dashboard while model connections load
- `7794f2a` Make compact dashboard tools usable and preserve note input
- `0046e47` Open web addresses directly from shared search
- `4dab200` Record deployed fixes and live browser verification
- `df1ef5f` Changelog for the codebase and UI fixes
- `0bb9ada` Merge codebase and UI fixes
- `e9e713d` Expose model connections, instructions and MCP management in settings
- `683f7c0` Keep stopped chat runs out of new conversations and tool calls
- `f781317` Fix themed controls, Customize navigation and narrow-screen overflow
- `823ecb6` End new-tab listeners and observers when a render is replaced
- `6110260` Import partial setups safely and preserve their selected parts
- `c185688` Migrate older settings without crashing or changing their source
- `fdae0d3` Keep settings saves when sync storage exceeds its quota
- `aa82bba` Changelog
- `8b7ee78` STATUS: deployed to the owner's Aside and checked live
- `e86ebd6` Changelog for the 2026-10-16 merge
- `d26b7b3` STATUS: audit decisions, phase plan and where work stopped; Gmail milestone screenshot
- `f98f3c5` identity permission for sign-in windows; Chrome 130 and Firefox 148 minimums

## 2026-10-14

- `65fa322` Remove 265 CSS selectors that can never match, and a test that keeps it that way
- `ad85072` Delete dead TypeScript found by the audit
- `3253934` Changelog is regenerated on main after a merge, not on every commit
- `b103eaa` CI: typecheck, tests and a Chrome build on every push; one version number
- `d411a39` Removing a widget in arrange mode no longer freezes the top bar
- `779d596` Customize › Reset layout redraws the grid
- `39a8147` Saved new-tab layout, folder colours and active space survive loading
- `a2b3056` Gmail runs signed in inside the sidebar frame
- `9a272f7` Point agents at the local full-session context folder (git-ignored)
- `57d7c8b` Shared pre-commit hook keeps CHANGELOG.md current and reminds about status and screenshots
- `0222d2c` AGENTS.md: do not pin the test count
- `6c7ef69` Project history: milestone screenshots, changelog, and a snap command
- `203bfa6` WIP: run Gmail and X inside sidegig frames; agent guide and status handoff
- `4cfb12d` Sidebar apps that fit, Arc-style rail plates, one rail per page, nothing over what you click
- `67c07ab` Steady rendering, and an AI chat built into the new tab

## 2026-10-13

- `64038cb` A desk on one grid, readable Clear widgets, simpler theming, pocket folders, arrange mode
- `3c4b78f` Working objects on every widget, an Add widgets list, settings redesign and a Size setting
- `3f0b21e` Crisp text, consistent icons, no shadows, an Anatomy timer
- `da8c0bf` New tab dashboard: day widgets, one Search/AI box, bookmarks grid with folders, glass cards
- `beda474` Collections from your own pictures (albums), tall pictures shown whole, search focus ring fix
- `f31953b` Scales with your screen, centred layout, Gmail/X in a docked side window, setups you can carry to any browser
- `853a6a5` Readable new tab: larger type and controls, contrast fixed on every theme; your own name on the page
- `e8d8fb0` New tab scrolls again: it inherited the sidebar's body overflow:hidden and fixed height
- `f7008ca` Wallpaper collections, studio effects, picture themes; icon and drawer fixes from live testing
- `d7c933d` New tab: 11 themes, Customize panel, backgrounds and custom uploads
- `78b01c1` New tab NTP-1: Match-browser looks (Chrome, Edge, Aside/Dia/Comet/Arc incl. Arc space colours, Opera, Brave, Vivaldi, Firefox) plus studio looks (Paper, Night, Ultramarine); Home | AI switch with browser-native AI (Aside, Copilot, Leo, Gemini, Perplexity), chats from history, Dia-style tab context; optional new tab with first-run choice and instant hand-back; Mynt-inspired tools: greeting, analog clock, Open-Meteo weather, engine picker, voice typing, to-do with daily reset, Google apps launcher, add shortcut, accent, wallpaper; bundled Barlow Condensed + IBM Plex Mono; no-flash boot
- `004a5aa` New tab edition: a short, finite issue picked from your interests (filled in by your AI via one prompt read back by the bridge), nine free keyless sources, weighted ranking and composition, save/dismiss learning with fade, Saved shelf, Interests editor, on-device AI review, settings and privacy docs, tests on real-response fixtures
- `6567cb9` Dock: narrow full-width fixed bars that follow the page shift, release stale shifts, decide html positioning once (fixes YouTube masthead/guide)
- `f6a860a` Opera-style docking and panel: rail docks and pages make room (fixed elements moved clear), apps open beside the buttons list in the sidebar panel, page rail steps aside when the panel opens on its side, side-mismatch hint, frame rules fixed for side panels, Trusted Types-safe rail

## 2026-10-11

- `ee8409c` Rename to sidegig and refine: Chrome design system (Google Sans Flex, Material Symbols), page-adaptive theme by default, AI picker, add-this-site, Dia-style tab groups, preloaded drawer, settings navigation
- `f4863c6` Margin v0.1: hover rail, apps in the browser sidebar, one-tap AI, bookmark stacks, search, status cards, workspaces, link rules, new tab, theme engine, cross-browser builds
