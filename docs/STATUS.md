# sidegig status and handoff

Last updated: 2026-10-16 (Codex bug review on `bugfix/codebase-review`; the earlier Phase 1 work remains on `main`).
Update this file when you stop work. Keep "Where work stopped" true.
History: [CHANGELOG.md](../CHANGELOG.md) (regenerated on `main` after each merge) and [evolution](evolution/README.md) (screenshots of every milestone).
Full build-session transcript, owner requests verbatim, and test tools: `context/README.md` (local only, not in git).

## Where work stopped

`main` holds the earlier work below (merged 2026-10-16 from `audit-fixes`, which was built on `wip/in-panel-apps`). Open branches: `bugfix/codebase-review` and `drawer-dynamic-url` (open work item 1). The full earlier audit report, session transcript and test scripts are in `context/claude-code-session-2026-10-14/` (local only).

**UI follow-up, 2026-10-16, `bugfix/codebase-review` (merge and deployment authorized; in progress):**

- Each render now has an abort signal. Replacing a new tab ends its bookmark, storage, keyboard and resize listeners, observers and timers. A browser probe across 12 redraws stays at 7 storage listeners, 1 bookmark listener, 1 resize listener, 4 keyboard listeners and 1 observer. Before the fix, bookmark listeners and observers grew from 1 to 13.
- The grid uses the page’s actual bottom padding. The fixture dashboard fits 1280×720, 1440×900 and 1920×1080 without vertical overflow. Arrange, resizing, removing Notes and Reset layout still work in the browser.
- Customize now has a visible close button, keyboard tabs, a Size control in Colours, and no reload memory. Async Wallpaper loads cannot overwrite a newer tab. Switches and segmented controls reflect each click immediately. Shared chat and help controls use the surface theme, with visible keyboard focus and correct dark fields. The mobile dashboard clips decorative feather overflow; 390×844 has no horizontal scroll. Hover and slip-drop motion use ease-out.
- Chat cancellation and AI settings fixes are also present in the worktree. They are being committed separately before the authorized merge. Final validation of the combined worktree passes: 123 tests, typecheck, all four builds and zips, and 16 fixture screens. The installed extension has not yet been rebuilt.

**Bug review, 2026-10-16, `bugfix/codebase-review` (not merged or deployed):**

- A save that exceeds sync quota now survives loading over an older synced copy. Each save keeps a device-local backup and an embedded timestamp. Loading chooses the newer copy; a newer remote save can still win. Custom CSS remains local. Six storage regression tests cover fallback, recovery, remote updates, legacy copies, browsers without sync and clock rollback after an observed save. Legacy copies without timestamps retain sync precedence because their age is unknown.
- Older settings migrations discard null and primitive app entries instead of crashing. The Clear-mode and wallpaper migrations copy nested data instead of changing the imported backup. Frozen-input and repeated-import regression tests pass.
- Setup imports now describe partial settings using the same defaults and migrations as Apply. Missing or empty look names no longer crash the summary. Explicitly empty part lists stay empty; a pictures-only code no longer acquires apps, looks and reading parts that could overwrite unrelated settings.
- Validation: 121 tests and the typecheck pass. All four targets and their store zips build in a temporary copy of the project; the installed `dist/chrome` is untouched. Sixteen fixture preview pages render, with zero changed pixels against `main` outside the installed rail after each fix. A browser check confirms that the same partial setup fails to open on the old code and opens its summary and part controls on the fixed code. The fixture screenshot is in `docs/evolution`.
- Browser workarounds: T3's automation disconnected and its reconnect stalled. The comparison used the `aside-browser` skill. The CLI required an update; the viewport-resize method was unavailable. An early capture ran during a rebuild and hit a missing fixture page; it was discarded. Another attempt hit Aside's temporary tab-edit lock. The successful captures use one tab, completed builds, an isolated baseline folder and the same existing viewport. Aside's one-shot REPL also closes tabs on exit, so interactive checks run in one invocation. The older pixel-diff helper emits a Pillow deprecation warning; a second diff using Pillow's image operations confirms the same zero-pixel result.
- Limits: no live cross-device sync, signed-in chat or bridge check was run. Legacy copies have no reliable save time; they retain sync precedence when both copies lack timestamps. An older extension version's untimestamped remote save cannot supersede a timestamped local copy. Concurrent edits from separate extension contexts still use whole-settings saves. Strongest alternative: the settings rollback was only stale UI state — ruled out by direct API-level save/load reproduction before and after the fix.

**Deployed 2026-10-16:** `dist/chrome` built from `main` is loaded in the owner's Aside (extension reloaded; the loaded manifest has `identity` and minimum Chrome 130). Checked live after the reload: Gmail reached the inbox in 2 s and stayed, X showed posts in 3 s. CI is green on `main`. All four targets and their store zips are in `dist/`. Nothing is published to a store.

**Gmail and X open inside sidegig's own sidebar frame, signed in** (checked live in the owner's Aside on 2026-10-14: Gmail stays in the inbox for 30 s and more, X shows the timeline).

- **X:** `src/content/framefit-main.ts` (MAIN world) adds `SameSite=None; Secure` to cookie writes, merges the site's same-site cookies into `document.cookie` reads (from `pageCookies` in `src/background/framecookies.ts`), and blocks service-worker registration.
- **Gmail, three layers, all fixed:**
  1. Frame-busting: `rewriteFrameChecks` (`src/shared/framecheck.ts`) turns `window!=top` checks in inline scripts into constants (`src/content/framefit.ts`).
  2. "Temporary Error" code 9: Gmail's code uses `top` as its own window (`_.pu(top, …)` for the gmonkey API, `top.document`, `top.js`, `win.top`). In the frame `top` is sidegig's cross-origin page, so module "a" threw a SecurityError and stopped before defining `_.gbg`; the `reading 'Kc'` crash was only the knock-on. Fix: `rewriteTopRefs` turns bare `top` into `self` and `x.top` reads into `__sidegigTop(x)` (the frame's window when x is that window). Inline scripts are rewritten as they stream in; Gmail's own-origin `<script src>` modules are fetched, rewritten and loaded from a blob, in order (`framefit-main.ts`). Only for hosts in `TOP_REWRITE_HOSTS` (Gmail).
  3. CookieMismatch about 4 s after the inbox showed: the DNR rules that appended same-site cookies to the frame's requests duplicated cookies the browser already sends. Deleted; X works without them too.
- **The phone layout is never applied to Gmail** (`dnr.ts` skips mail.google.com, and the app bar hides the phone button for Gmail): `mobile: true` on Gmail sent mobile Gmail into a reload loop and risks Google's re-sign-in prompt.
- How it was found (repeatable loop, about 10 s per run): open `panel.html` in an Aside tab, set `chrome.storage.local.panelRequest = {appId:'gmail', ts:Date.now()}`, poll the `sidegig-app-gmail` frame's title and path. Gmail swallows its own errors (`_._DumpException`), so a temporary trap on that setter is how the first error was found. The scripts are in `context/claude-code-session-2026-10-14/working-files/`.
- Settings are at v10 (Gmail, X and the other `NO_FRAME` apps open in the panel).

**New-tab fixes:**

- **A saved layout, folder colours and the active space survive loading.** `mergeSettings` (`src/shared/storage.ts`) kept only keys present in the defaults, so the `{}` defaults of `newtab.layout` and `newtab.folderTones` always came back empty, and `stacks.activeSpace` (no default) was dropped. An empty-object default now marks a map whose keys are the user's, and `activeSpace` defaults to `''` (readers use `||`). Not yet checked by hand in the real extension: arrange a widget, reload, see it stay.
- **Customize › Reset layout redraws the grid.** The grid now follows layout saves made anywhere (`onSettingsChanged` in `src/ui/views/ntgrid.ts`, which also covers a second open new tab). Checked in the preview.
- **Removing a widget in arrange mode no longer freezes the top bar.** A grid built while `html[data-arranging]` is set resumes arranging (`edit(true, true)`, quiet). Checked in the preview: red on the old code, green after. The preview loop page needs cache-busted script URLs (`ui.js?v=…`), or the browser runs a stale `ui.js`.

**Audit, 2026-10-14.** The whole codebase was read for over-engineering, architecture and security. The owner answered 16 questions (see Key decisions). Done so far (Phase 1):

- CI: `.github/workflows/ci.yml` typechecks, tests and builds Chrome on every push (Node 24, `engines` in `package.json`). The version number comes from `package.json` only.
- `CHANGELOG.md` is regenerated on `main` after a merge (the pre-commit hook only reminds).
- Dead TypeScript deleted (306 lines). `tsc --noUnusedLocals` is clean.
- 265 CSS selectors that can never match deleted (`ui.css` 2494 → 2246 lines). `scripts/css-check.mjs` finds them (`--fix` removes them) and `test/css.test.ts` keeps the count at zero. A 16-page before/after screenshot diff in the preview showed 0 changed pixels.
- The `identity` permission (OpenRouter and MCP sign-in windows); minimum Chrome 130 and Firefox 148.

## Open work, in priority order

The audit plan, then the earlier list. Run the typecheck, tests and preview diff after each step; live checks in the owner's Aside are announced first.

1. **Phase 1b, hardening** (owner: "Yes, as Phase 1b").
   - Branch `drawer-dynamic-url` puts the drawer behind Chrome's per-session random URL (`use_dynamic_url`), so websites can't embed it. Not merged: a drawer at that URL starts its app frames from a second host, so the frame rules now list both hosts (`applyRules` in `src/background/dnr.ts`), but nobody has seen it work. Before merging, check live: an app opens inside the in-page drawer on a normal page, and Gmail and X still open in the side panel. If a drawer app fails, compare the drawer document's origin with rule 1's `initiatorDomains` (`declarativeNetRequest.testMatchOutcome`).
   - Limit header rule 2 to sidegig's own frames (`tabIds: [-1, …]`).
   - Rail ↔ drawer messages over a `MessageChannel` instead of `postMessage('*')`.
   - Background message checks: decide from `sender` (URL, extension page or not), not from hosts named inside the message (`frame-cookies`, `clear-sw`, `profile-import`, `badge`, `ai-claim`).
   - Bridge: pairing code from `sidegig-bridge setup`, proved on every connection; frame-size limit; reject unmasked frames; cap Codex runs and stop them when the socket closes; tool calls belong to the socket that asked.
2. **AI settings section** in `src/options/main.ts` (owner chose the full section): keys, local server address, browser model status, ChatGPT plan (Codex) toggle, OpenRouter sign-in, custom instructions, MCP servers add/remove (`mcpServers` is read but nothing writes it; `mcpSignIn` exists), bridge status and the pairing-code field. Agent access off/read/full waits for the bridge's browser side (item 9).
3. **Phase 2, typed data:** a typed schema for the `chrome.storage.local` keys and the `sidegig.nt*` localStorage keys; a pure `normalizeSettings` with ordered migrations and explicit user-owned maps (newest-wins loading and the known migration mutations are fixed on `bugfix/codebase-review`); one typed message protocol with a handler map in `src/background/index.ts`. Verify cross-device sync and coordinate simultaneous edits from separate contexts.
4. **Phase 3, new tab and CSS:** the new tab owns its lifecycle (one session object and an abort signal per render, which also ends the listener leaks); a widget registry; Customize talks to the page through one API and starts closed after a reload (its sessionStorage memory is cut); `sync()` redraws only the subsystem that changed. CSS: one component set (buttons, chips, toggles, fields, menus, cards) on panel, drawer, options and new tab, colours from each surface's own theme; fix the undefined tokens (`--c-surface`, `--m-surface-2`, `data-theme`), the white help box in a dark sidebar and the unthemed panel chat. Changed digits bounce everywhere (clock, to-do count, timer); remove the overshoot from figure hover and the slip drop. Delete the overridden pattern-fade rule in `ui.css`.
5. **Phase 4, tests:** a fake `chrome.*` seam built from the preview shim; router tests; a manifest snapshot test; bridge tests through Node's WebSocket client; preview end-to-end scripts.
6. Phone layouts in the side panel and a live check of Calendar, Instagram, Grok and Messenger in frames (Gmail and X done). Watch Gmail for other `top` uses in modules it loads later (compose, settings, chat); `TOP_REWRITE_HOSTS` covers mail.google.com only.
7. Sharp icons: each site's best icon source, fitted (see `src/shared/iconfit.ts`, `src/background/favicons.ts`).
8. Sidebar chat: `chatUi(ctx, { where: 'panel' })` exists; wire it into `panel.html` and add a rail button.
9. Agent bridge end to end: run `bridge/sidegig-bridge.mjs` (WebSocket handshake, a `codex.run` prompt); build the extension side that answers `browser_*` tool calls, with an agent-access setting and a visible banner while an agent controls a tab.
10. Settings page redesign (sticky header with search, live slider values, "Saved" chip, Appearance first). A previous script failed near `opt('Delay', ...)` in `src/options/main.ts`; inspect that line first.
11. Size slider in the Customize Theme tab (the Layout tab has one). Check new-tab sizes at 1280x720, 1440x900, 1920x1080.
12. Verify in the real extension after a reload: the saved layout surviving a reload, new-tab grid and Clear mode, arrange mode, chat with a real key, rail plates and single rail, icon fit, the Pomodoro seconds hand, bell and digit bounce.
13. Undecided (ask the owner): Opera-style drawer placement next to the rail; hiding the page rail while Chrome's side panel is open; the product name (sidegig, Ledge or Edgewise); default wallpaper.

## Blocked or limited

- Chrome's side panel shows only extension pages. Sites that refuse frames need the frame work above, or the docked side window.
- Safari project generation needs a Mac: `npm run safari`.
- macOS full screen: a side window gets its own space, so apps open as a tab beside the current one.
- Switching Gmail to a mobile user agent made Google ask for the password again. Do not spoof Gmail's user agent. The code now enforces this.

## Key decisions (keep unless the owner changes them)

- Free and open source (GPL-3.0). No paid tier, donations, sponsors or affiliate links. Ask the owner before adding any income path.
- Design: Chrome/Material 3 look, Google Sans Flex, Material Symbols, accent `#0b57d0`, adaptive page theme. No drop shadows or glows, no sparkle "AI" icon, sentence-case labels, no middle-dot "A · B · C" strings, no arrow glyphs glued to text, ease-out motion without bounce or overshoot, except that digits bounce when they change (clock, to-do count, timer; owner, 2026-10-14), respect reduced motion. Text never sits directly on a busy wallpaper without the readability layer.
- Docking: margin on `html` plus per-element translate for fixed elements. Never `transform` or `contain` on `html`.
- Header stripping (X-Frame-Options, CSP) only for sub_frame requests from the extension; never main_frame.
- New tab: a 12 x 8 grid that fits one screen (`src/shared/layout.ts`); narrow or short windows fall back to one column. Clear mode picks text tone per widget by sampling the wallpaper (`src/shared/legible.ts`, `src/ui/views/ntlegible.ts`).
- Chat: clean-room from public API docs and the MCP spec. Keys stay on the device (`aiKeys`, local storage, never synced). ChatGPT-plan access only through the official Codex CLI via the bridge. Claude and Gemini subscriptions are not supported (their terms forbid third-party use); use API keys. No identity spoofing, no reading other apps' tokens.
- Bridge: one local daemon on `127.0.0.1:47617`; the extension connects over WebSocket; web pages are refused. Pairing is by a code that `sidegig-bridge setup` prints and the owner pastes once in AI settings (decided 2026-10-14; today the first extension origin is paired).
- Icons: the site's own icon at screen resolution, measured and fitted to one visual size; bundled CC0 brand glyphs when the browser has none.
- One rail per page: an older rail instance removes itself.

### Owner decisions from the 2026-10-14 audit round

- Audit fixes go on their own branch, one commit per fix, pushed per phase; the work stops only when a test or live check fails. Nothing merges to `main` until the owner says.
- Live checks in the owner's Aside (side panel, Gmail, X) are allowed for sidebar, frame and background changes, announced before each. The new tab is checked in the preview with fixtures.
- Chat tools keep running without asking ("Never ask").
- The `identity` permission is required on every target. Minimums: Chrome 130, Firefox 148, no fallback code.
- CSS: "fix what is broken and make it look consistent across the whole tool": one component set on every surface, each surface keeps its own colour theme.
- Changelog is generated at merge (done). The history chat finder is deleted (done). Customize's reload memory is cut, and the overridden pattern-fade rule is deleted rather than restored (both open work 4).

## Commit history (recent)

Full list: [CHANGELOG.md](../CHANGELOG.md).

- `3598f2b` identity permission; Chrome 130 and Firefox 148 minimums
- `20e53e2` Remove 265 CSS selectors that can never match, and a test that keeps it that way
- `0b40c50` Delete dead TypeScript found by the audit
- `988e9e2` CI: typecheck, tests and a Chrome build on every push; one version number
- `aae3fce` Removing a widget in arrange mode no longer freezes the top bar
- `51b363d` Gmail runs signed in inside the sidebar frame
- `11c528c` Sidebar apps that fit, Arc-style rail plates, one rail per page
